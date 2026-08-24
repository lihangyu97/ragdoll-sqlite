import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { TableSchemaEntry } from '@shared/types'
import { fetchDatabases, fetchTables } from '@/api'

interface SchemasState {
  /** 表/视图清单（含字段预取），null = 加载中；未打开数据库时为 [] */
  schemas: TableSchemaEntry[] | null
  /** 加载失败信息，null = 无错误 */
  error: string | null
  /** 重新拉取表清单（切换数据库后调用） */
  refresh: () => void
}

const SchemasContext = createContext<SchemasState | null>(null)

/**
 * 表/视图清单的全局提供者：挂载时预取一次；切换数据库后调用 refresh() 重新拉取
 * （此时 schemas 先置 null，触发全局加载态，页面自动用新库数据）。
 * 启动时未打开数据库（/api/databases 返回 current: null）则不拉表清单，
 * schemas 置 []，主页展示「选择数据库」引导。
 */
export function SchemasProvider({ children }: { children: ReactNode }) {
  const [schemas, setSchemas] = useState<TableSchemaEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    // 微任务中置加载态，规避 react-hooks/set-state-in-effect 规则；
    // 切换库时先清空旧表清单，避免旧库数据残留
    queueMicrotask(() => setSchemas(null))
    ;(async () => {
      const info = await fetchDatabases()
      if (!info.current) {
        // 尚未打开数据库：不拉表清单，主页展示选择入口
        setSchemas([])
        return
      }
      const list = await fetchTables()
      // 防御：旧版服务端进程不返回 columns，导致页面白屏，给明确提示
      if (!list.every(s => Array.isArray(s.columns))) {
        setError(
          '服务端响应缺少表字段信息。可能是旧的服务进程仍在运行，请先停止旧的 ragdoll-sqlite 再重新启动。'
        )
        return
      }
      setSchemas(list)
    })().catch(err => setError((err as Error).message))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <SchemasContext.Provider value={{ schemas, error, refresh }}>
      {children}
    </SchemasContext.Provider>
  )
}

/** 取表/视图清单（须在 SchemasProvider 内使用） */
export function useSchemas(): SchemasState {
  const ctx = useContext(SchemasContext)
  if (!ctx) throw new Error('useSchemas 必须在 SchemasProvider 内使用')
  return ctx
}

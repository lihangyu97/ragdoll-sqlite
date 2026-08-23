import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { TableSchemaEntry } from '@shared/types'
import { fetchTables } from '@/api'

interface SchemasState {
  /** 表/视图清单（含字段预取），null = 加载中 */
  schemas: TableSchemaEntry[] | null
  /** 加载失败信息，null = 无错误 */
  error: string | null
}

const SchemasContext = createContext<SchemasState | null>(null)

/**
 * 表/视图清单的全局提供者：App 挂载时一次预取，供页面（TablePage、未来的查询页等）按需取用。
 */
export function SchemasProvider({ children }: { children: ReactNode }) {
  const [schemas, setSchemas] = useState<TableSchemaEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTables()
      .then(list => {
        // 防御：旧版服务端进程不返回 columns，导致页面白屏，给明确提示
        if (!list.every(s => Array.isArray(s.columns))) {
          setError(
            '服务端响应缺少表字段信息。可能是旧的服务进程仍在运行，请先停止旧的 ragdoll-sqlite 再重新启动。'
          )
          return
        }
        setSchemas(list)
      })
      .catch(err => setError((err as Error).message))
  }, [])

  return <SchemasContext.Provider value={{ schemas, error }}>{children}</SchemasContext.Provider>
}

/** 取表/视图清单（须在 SchemasProvider 内使用） */
export function useSchemas(): SchemasState {
  const ctx = useContext(SchemasContext)
  if (!ctx) throw new Error('useSchemas 必须在 SchemasProvider 内使用')
  return ctx
}

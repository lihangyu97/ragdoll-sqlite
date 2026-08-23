import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CustomView } from '@shared/types'
import { createView, deleteView, fetchViews, updateView } from '@/api'

interface ViewsState {
  /** 自定义视图列表，null = 加载中 */
  views: CustomView[] | null
  /** 重新拉取列表（保存/删除后调用） */
  refresh: () => void
  create: (name: string, sql: string) => Promise<CustomView>
  update: (id: number, patch: { name?: string; sql?: string }) => Promise<CustomView>
  remove: (id: number) => Promise<void>
}

const ViewsContext = createContext<ViewsState | null>(null)

/**
 * 自定义视图的全局提供者：侧边栏菜单（展示列表）与查询页（保存/更新/删除）共享。
 * 存储于应用自己的 views.db，跨会话保留。
 */
export function ViewsProvider({ children }: { children: ReactNode }) {
  const [views, setViews] = useState<CustomView[] | null>(null)

  const refresh = useCallback(() => {
    fetchViews()
      .then(setViews)
      .catch(() => setViews([])) // 加载失败降级为空列表（应用存储不可用时视图功能不可用）
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (name: string, sql: string) => {
      const view = await createView(name, sql)
      refresh()
      return view
    },
    [refresh]
  )

  const update = useCallback(
    async (id: number, patch: { name?: string; sql?: string }) => {
      const view = await updateView(id, patch)
      refresh()
      return view
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number) => {
      await deleteView(id)
      refresh()
    },
    [refresh]
  )

  return (
    <ViewsContext.Provider value={{ views, refresh, create, update, remove }}>
      {children}
    </ViewsContext.Provider>
  )
}

/** 取自定义视图（须在 ViewsProvider 内使用） */
export function useViews(): ViewsState {
  const ctx = useContext(ViewsContext)
  if (!ctx) throw new Error('useViews 必须在 ViewsProvider 内使用')
  return ctx
}

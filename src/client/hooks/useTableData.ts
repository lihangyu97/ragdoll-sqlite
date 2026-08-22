import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FilterCondition, RowsResult, SortSpec, TableInfo } from '@shared/types'
import { fetchRows, fetchTableInfo, refreshRowCountCache } from '@/api'

export interface UseTableData {
  info: TableInfo | null
  rows: RowsResult | null
  loadingRows: boolean
  dataError: string | null
  clearError: () => void
  page: number
  pageSize: number
  onPageChange: (page: number, pageSize: number) => void
  filters: FilterCondition[]
  setFilters: (filters: FilterCondition[]) => void
  sort: SortSpec | null
  setSort: (sort: SortSpec | null) => void
  refresh: () => void
  hidden: ReadonlySet<string>
  toggleColumnHidden: (name: string) => void
}

/**
 * 选中表的数据获取：结构详情 + 分页数据 + 按列过滤。
 * - `selected` 由外部（路由 URL）派生，本 hook 不再持有选中态
 * - 请求序号守卫：切表/翻页/改过滤后丢弃过期响应，避免旧数据覆盖新状态
 * - 切换表时清空过滤/排序/翻页（按表持有语义），旧行保留在 loading 遮罩下避免表格塌缩
 * - 隐藏列按表记忆：切走再切回仍保留；刷新不清除
 */
export function useTableData(selected: string | null): UseTableData {
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [rows, setRows] = useState<RowsResult | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loadingRows, setLoadingRows] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<FilterCondition[]>([])
  const [sort, setSortState] = useState<SortSpec | null>(null)
  /** 刷新计数：让 info/rows effect 无条件重跑（筛选本来就为空时也需要） */
  const [refreshSeq, setRefreshSeq] = useState(0)
  /** 隐藏列（前端展示偏好，按表记忆；刷新不清除） */
  const [hiddenByTable, setHiddenByTable] = useState<Record<string, string[]>>({})
  const infoSeq = useRef(0)
  const rowsSeq = useRef(0)
  /** 最近一次发起过请求的表（切表判断用） */
  const lastSelectedRef = useRef<string | null>(null)

  // 切表重置：分页/结构/过滤/排序/错误回到初始值（按表持有，切表即清空）。
  // 与数据 effect 同轮触发，重置的 setState 到下一渲染才生效。
  useEffect(() => {
    // 微任务中 setState，规避 react-hooks/set-state-in-effect 规则
    queueMicrotask(() => {
      setPage(1)
      setPageSize(10)
      setInfo(null)
      setDataError(null)
      setFiltersState([])
      setSortState(null)
      // rows 不清空：旧行保留在 loading 遮罩下，避免表格塌缩导致滚动条闪烁
    })
  }, [selected])

  // 结构详情（外键/索引；字段已由 schema 预取，无需等待）
  useEffect(() => {
    if (!selected) return
    const seq = ++infoSeq.current
    fetchTableInfo(selected)
      .then(data => {
        if (seq !== infoSeq.current) return // 过期响应，丢弃
        setDataError(null)
        setInfo(data)
      })
      .catch(err => {
        if (seq !== infoSeq.current) return
        setDataError((err as Error).message)
      })
  }, [selected, refreshSeq])

  // 分页数据（带过滤条件）
  useEffect(() => {
    if (!selected) return
    const prev = lastSelectedRef.current
    lastSelectedRef.current = selected
    if (prev !== null && prev !== selected) {
      // 切表：跳过本轮（重置的 setState 尚未生效），避免用旧表的 filters/sort 请求新表；
      // 递增 seq 使切表前 in-flight 的旧表响应失效，下一轮（重置完成）再正常拉取
      rowsSeq.current++
      return
    }
    const seq = ++rowsSeq.current
    // 在微任务中置 loading：请求开始时及时显示遮罩，
    // 同时避免在 effect 体内同步 setState（react-hooks/set-state-in-effect）
    queueMicrotask(() => {
      if (seq === rowsSeq.current) setLoadingRows(true)
    })
    fetchRows(selected, { page, pageSize, filters, sort })
      .then(data => {
        if (seq !== rowsSeq.current) return
        setDataError(null)
        setRows(data)
      })
      .catch(err => {
        if (seq !== rowsSeq.current) return
        setDataError((err as Error).message)
        setRows(null) // 加载失败清空旧行，避免“新表头 + 旧数据”
      })
      .finally(() => {
        if (seq === rowsSeq.current) setLoadingRows(false)
      })
  }, [selected, page, pageSize, filters, sort, refreshSeq])

  const clearError = useCallback(() => setDataError(null), [])

  const onPageChange = useCallback((p: number, ps: number) => {
    setPage(p)
    setPageSize(ps)
  }, [])

  const setFilters = useCallback((next: FilterCondition[]) => {
    setFiltersState(next)
    setPage(1) // 改过滤条件后回到第 1 页
  }, [])

  const setSort = useCallback((next: SortSpec | null) => {
    setSortState(next)
    setPage(1) // 改排序后回到第 1 页
  }, [])

  /**
   * 刷新当前表：清除全部筛选、重新拉取数据与结构；排序保留。
   * 先清空服务端行数缓存（外部可能改过库），再重跑 info/rows 请求。
   */
  const refresh = useCallback(() => {
    setFiltersState([])
    setDataError(null)
    refreshRowCountCache()
      .catch(() => {
        // 旧版服务端没有该端点时忽略，数据仍会刷新（行数可能走缓存）
      })
      .finally(() => setRefreshSeq(s => s + 1))
  }, [])

  // 当前表的隐藏列集合（按表记忆，切表后回来仍保留；刷新不清除）
  const hidden = useMemo(
    () => new Set(selected ? (hiddenByTable[selected] ?? []) : []),
    [selected, hiddenByTable]
  )

  const toggleColumnHidden = useCallback(
    (name: string) => {
      setHiddenByTable(prev => {
        if (!selected) return prev
        const current = prev[selected] ?? []
        const next = current.includes(name) ? current.filter(c => c !== name) : [...current, name]
        return { ...prev, [selected]: next }
      })
    },
    [selected]
  )

  return {
    info,
    rows,
    loadingRows,
    dataError,
    clearError,
    page,
    pageSize,
    onPageChange,
    filters,
    setFilters,
    sort,
    setSort,
    refresh,
    hidden,
    toggleColumnHidden
  }
}

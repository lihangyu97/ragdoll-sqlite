import { useCallback, useEffect, useRef, useState } from 'react'
import type { RowsResult, TableInfo } from '../shared/types.js'
import { apiFetch } from './api.js'

export interface UseTableData {
  selected: string | null
  select: (name: string) => void
  info: TableInfo | null
  rows: RowsResult | null
  loadingRows: boolean
  dataError: string | null
  clearError: () => void
  page: number
  pageSize: number
  onPageChange: (page: number, pageSize: number) => void
}

/**
 * 选中表的数据获取：结构详情 + 分页数据。
 * - 请求序号守卫：切换表/翻页后丢弃过期响应，避免旧数据覆盖新状态（卡 loading/闪错数据）
 * - 切换表时保留旧行（loading 遮罩下）避免表格塌缩；加载失败则清空，防止“新表头 + 旧数据”
 * - 重复选择当前表时不重置（避免结构 Tab 卡在加载）
 */
export function useTableData(): UseTableData {
  const [selected, setSelected] = useState<string | null>(null)
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [rows, setRows] = useState<RowsResult | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [loadingRows, setLoadingRows] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const infoSeq = useRef(0)
  const rowsSeq = useRef(0)
  const selectedRef = useRef<string | null>(null)

  const select = useCallback((name: string) => {
    if (selectedRef.current === name) return
    selectedRef.current = name
    setSelected(name)
    setPage(1)
    setInfo(null)
    setDataError(null)
    // rows 不清空：旧行保留在 loading 遮罩下，避免表格塌缩导致滚动条闪烁
  }, [])

  // 结构详情（外键/索引；字段已由 schema 预取，无需等待）
  useEffect(() => {
    if (!selected) return
    const seq = ++infoSeq.current
    apiFetch<TableInfo>(`/api/tables/${encodeURIComponent(selected)}`)
      .then(data => {
        if (seq !== infoSeq.current) return // 过期响应，丢弃
        setDataError(null)
        setInfo(data)
      })
      .catch(err => {
        if (seq !== infoSeq.current) return
        setDataError((err as Error).message)
      })
  }, [selected])

  // 分页数据
  useEffect(() => {
    if (!selected) return
    const seq = ++rowsSeq.current
    // 在微任务中置 loading：请求开始时及时显示遮罩，
    // 同时避免在 effect 体内同步 setState（react-hooks/set-state-in-effect）
    queueMicrotask(() => {
      if (seq === rowsSeq.current) setLoadingRows(true)
    })
    apiFetch<RowsResult>(`/api/tables/${encodeURIComponent(selected)}/rows`, { page, pageSize })
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
  }, [selected, page, pageSize])

  const clearError = useCallback(() => setDataError(null), [])

  const onPageChange = useCallback((p: number, ps: number) => {
    setPage(p)
    setPageSize(ps)
  }, [])

  return {
    selected,
    select,
    info,
    rows,
    loadingRows,
    dataError,
    clearError,
    page,
    pageSize,
    onPageChange
  }
}

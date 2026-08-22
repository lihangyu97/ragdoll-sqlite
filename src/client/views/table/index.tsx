import { Empty } from 'antd'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import type { TableSchemaEntry } from '@shared/types'
import { useTableData } from '@/hooks/useTableData'
import TableView from '@/views/table/TableView'
import './index.css'

interface TablePageProps {
  schemas: TableSchemaEntry[]
}

/**
 * 表数据页：表/视图共用的浏览视图，`?table=` 参数决定查哪张表。
 * - 选中表完全由 URL 派生（HashRouter 内 query），刷新/前进后退/直达链接都保持
 * - 无 `?table=` 参数时自动选中第一张表（保持原启动行为）
 * - token（hash 外 `?t=`）不受路由影响
 */
export default function TablePage({ schemas }: TablePageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('table')
  const {
    info,
    rows,
    loadingRows,
    dataError,
    clearError,
    onPageChange,
    filters,
    setFilters,
    sort,
    setSort,
    refresh,
    hidden,
    toggleColumnHidden
  } = useTableData(selected)

  // 自动选中第一张表：schemas 已加载、URL 未指定 table 时补上（replace 不堆历史）
  useEffect(() => {
    if (selected === null && schemas.length > 0) {
      const next = new URLSearchParams(searchParams)
      next.set('table', schemas[0].name)
      setSearchParams(next, { replace: true })
    }
  }, [selected, schemas, searchParams, setSearchParams])

  const selectedSchema = schemas.find(s => s.name === selected) ?? null
  // 超大库（>50 表）时 schema 不带字段 → 用详情接口的 columns 兜底
  const tableColumns =
    selectedSchema && selectedSchema.columns.length > 0
      ? selectedSchema.columns
      : (info?.columns ?? [])

  if (selectedSchema === null) {
    return (
      <Empty
        description={
          schemas.length === 0 ? '数据库中没有表或视图' : `表或视图「${selected ?? ''}」不存在`
        }
        style={{ marginTop: 80 }}
      />
    )
  }

  return (
    <TableView
      schema={selectedSchema}
      columns={tableColumns}
      info={info}
      rows={rows}
      loadingRows={loadingRows}
      dataError={dataError}
      clearError={clearError}
      onPageChange={onPageChange}
      filters={filters}
      onFiltersChange={setFilters}
      sort={sort}
      onSortChange={setSort}
      onRefresh={refresh}
      hidden={hidden}
      onToggleColumnHidden={toggleColumnHidden}
    />
  )
}

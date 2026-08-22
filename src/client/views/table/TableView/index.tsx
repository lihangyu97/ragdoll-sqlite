import {
  EyeOutlined,
  FilterOutlined,
  ReloadOutlined,
  SortAscendingOutlined,
  TableOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'
import { Alert, Button, Space, Spin, Tabs, Tag, Tooltip, Typography } from 'antd'
import { useState } from 'react'
import type {
  ColumnInfo,
  FilterCondition,
  RowsResult,
  SortSpec,
  TableInfo,
  TableSchemaEntry
} from '@shared/types'
import ColumnVisibilityModal from '@/views/table/TableView/components/ColumnVisibilityModal'
import DataTable from '@/views/table/TableView/components/DataTable'
import FilterBar from '@/views/table/TableView/components/FilterBar'
import FilterModal from '@/views/table/TableView/components/FilterModal'
import SortModal from '@/views/table/TableView/components/SortModal'
import StructureTable from '@/views/table/TableView/components/StructureTable'

interface TableViewProps {
  schema: TableSchemaEntry
  /** 列定义：schema 预取字段，超大库时用详情接口的 columns 兜底 */
  columns: ColumnInfo[]
  info: TableInfo | null
  rows: RowsResult | null
  loadingRows: boolean
  dataError: string | null
  clearError: () => void
  onPageChange: (page: number, pageSize: number) => void
  filters: FilterCondition[]
  onFiltersChange: (filters: FilterCondition[]) => void
  sort: SortSpec | null
  onSortChange: (sort: SortSpec | null) => void
  onRefresh: () => void
  hidden: ReadonlySet<string>
  onToggleColumnHidden: (name: string) => void
}

/** 表数据浏览视图：表头（名称/类型/行数/刷新/查询/排序）+ 数据/结构 Tabs（数据可按列过滤、排序） */
export default function TableView({
  schema,
  columns,
  info,
  rows,
  loadingRows,
  dataError,
  clearError,
  onPageChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  onRefresh,
  hidden,
  onToggleColumnHidden
}: TableViewProps) {
  const [queryOpen, setQueryOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const rowCountText = loadingRows
    ? '…'
    : rows
      ? rows.total.toLocaleString()
      : info
        ? info.rowCount.toLocaleString()
        : '…'

  const isView = schema.type === 'view'
  const hasConditions = filters.length > 0 || sort !== null

  return (
    <>
      <div className="table-header">
        <Typography.Title
          level={4}
          style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {isView ? <EyeOutlined /> : <TableOutlined />}
          {schema.name}
          <Tag color={isView ? 'cyan' : 'green'}>{isView ? '视图' : '表'}</Tag>
          <Typography.Text type="secondary">共 {rowCountText} 行</Typography.Text>
          <Tooltip title="刷新（清除筛选并重新加载，排序保留）">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              style={{ marginLeft: 8 }}
              onClick={onRefresh}
            />
          </Tooltip>
          <Button size="small" icon={<FilterOutlined />} onClick={() => setQueryOpen(true)}>
            查询
          </Button>
          <Button size="small" icon={<SortAscendingOutlined />} onClick={() => setSortOpen(true)}>
            排序
          </Button>
          <Button
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={() => setColumnsOpen(true)}
          >
            字段
          </Button>
        </Typography.Title>
      </div>
      {dataError && (
        <Alert
          type="error"
          showIcon
          title={dataError}
          style={{ marginBottom: 12 }}
          closable={{ onClose: clearError }}
        />
      )}
      <Tabs
        items={[
          {
            key: 'data',
            label: '数据',
            children:
              columns.length === 0 ? (
                <div className="loading-wrap">
                  <Spin size="large" />
                </div>
              ) : (
                <>
                  {hasConditions && (
                    <Space wrap size={4} style={{ marginBottom: 8 }}>
                      <FilterBar
                        filters={filters}
                        onRemove={i => onFiltersChange(filters.filter((_, j) => j !== i))}
                        onClear={() => onFiltersChange([])}
                      />
                      {sort && (
                        <Tag color="geekblue" closable onClose={() => onSortChange(null)}>
                          排序: {sort.column} {sort.direction === 'asc' ? '↑ 升序' : '↓ 降序'}
                        </Tag>
                      )}
                    </Space>
                  )}
                  <DataTable
                    key={schema.name}
                    tableName={schema.name}
                    columns={columns}
                    hiddenColumns={hidden}
                    rows={rows}
                    loading={loadingRows}
                    onPageChange={onPageChange}
                  />
                </>
              )
          },
          {
            key: 'structure',
            label: '结构',
            children: <StructureTable columns={columns} info={info} />
          }
        ]}
      />

      <FilterModal
        open={queryOpen}
        columns={columns}
        initial={filters}
        onCancel={() => setQueryOpen(false)}
        onSubmit={next => {
          onFiltersChange(next)
          setQueryOpen(false)
        }}
      />
      <SortModal
        open={sortOpen}
        columns={columns}
        initial={sort}
        onCancel={() => setSortOpen(false)}
        onApply={next => {
          onSortChange(next)
          setSortOpen(false)
        }}
      />
      <ColumnVisibilityModal
        open={columnsOpen}
        columns={columns}
        hidden={hidden}
        onCancel={() => setColumnsOpen(false)}
        onToggle={onToggleColumnHidden}
      />
    </>
  )
}

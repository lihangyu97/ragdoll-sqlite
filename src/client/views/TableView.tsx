import {
  EyeOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  TableOutlined
} from '@ant-design/icons'
import { Alert, Button, Space, Spin, Tabs, Tag, Typography } from 'antd'
import { useState } from 'react'
import type {
  ColumnInfo,
  FilterCondition,
  RowsResult,
  SortSpec,
  TableInfo,
  TableSchemaEntry
} from '../../shared/types.js'
import DataTable from '../components/DataTable.js'
import FilterBar from '../components/FilterBar.js'
import FilterModal from '../components/FilterModal.js'
import SortModal from '../components/SortModal.js'
import StructureTable from '../components/StructureTable.js'

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
}

/** 表数据浏览视图：表头（名称/类型/行数/查询/排序）+ 数据/结构 Tabs（数据可按列过滤、排序） */
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
  onSortChange
}: TableViewProps) {
  const [queryOpen, setQueryOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
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
          <Button
            size="small"
            icon={<FilterOutlined />}
            style={{ marginLeft: 8 }}
            onClick={() => setQueryOpen(true)}
          >
            查询
          </Button>
          <Button size="small" icon={<SortAscendingOutlined />} onClick={() => setSortOpen(true)}>
            排序
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
    </>
  )
}

import { EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Alert, Spin, Tabs, Tag, Typography } from 'antd'
import type { ColumnInfo, RowsResult, TableInfo, TableSchemaEntry } from '../../shared/types.js'
import DataTable from '../components/DataTable.js'
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
}

/** 表数据浏览视图：表头（名称/类型/行数）+ 数据/结构 Tabs */
export default function TableView({
  schema,
  columns,
  info,
  rows,
  loadingRows,
  dataError,
  clearError,
  onPageChange
}: TableViewProps) {
  const rowCountText = loadingRows
    ? '…'
    : rows
      ? rows.total.toLocaleString()
      : info
        ? info.rowCount.toLocaleString()
        : '…'

  const isView = schema.type === 'view'

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
                <DataTable
                  key={schema.name}
                  tableName={schema.name}
                  columns={columns}
                  rows={rows}
                  loading={loadingRows}
                  onPageChange={onPageChange}
                />
              )
          },
          {
            key: 'structure',
            label: '结构',
            children: <StructureTable columns={columns} info={info} />
          }
        ]}
      />
    </>
  )
}

import { Table, Tooltip, type TableColumnsType } from 'antd'
import type { ColumnInfo, RowsResult, TableInfo } from '../../shared/types.js'
import CellValue from './CellValue.js'

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 500]

interface DataTableProps {
  info: TableInfo
  rows: RowsResult
  loading: boolean
  onPageChange: (page: number, pageSize: number) => void
}

/** 「数据」Tab：分页表格（服务端分页，__row 为稳定行号） */
export default function DataTable({ info, rows, loading, onPageChange }: DataTableProps) {
  const columns: TableColumnsType<Record<string, unknown>> = [
    {
      title: '#',
      key: '__row',
      width: 60,
      render: (_v, record) => <span className="cell-number">{String(record.__row)}</span>
    },
    ...info.columns.map((c: ColumnInfo) => ({
      title: (
        <Tooltip
          title={`${c.name}${c.type ? ` : ${c.type}` : ''}${c.pk > 0 ? '（主键）' : ''}${c.notNull ? '（非空）' : ''}`}
        >
          <span>{c.name}</span>
        </Tooltip>
      ),
      dataIndex: c.name,
      key: c.name,
      ellipsis: true,
      render: (v: unknown) => <CellValue value={v} />
    }))
  ]

  return (
    <Table<Record<string, unknown>>
      size="small"
      columns={columns}
      dataSource={rows.rows}
      rowKey="__row"
      loading={loading}
      scroll={{ x: 'max-content' }}
      pagination={{
        current: rows.page,
        pageSize: rows.pageSize,
        total: rows.total,
        showSizeChanger: true,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        showTotal: total => `共 ${total.toLocaleString()} 行`,
        onChange: onPageChange
      }}
    />
  )
}

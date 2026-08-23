import { Space, Table, Tag } from 'antd'
import { useMemo } from 'react'
import type { QueryResult } from '@shared/types'
import CellValue from '@/components/CellValue'

interface QueryResultTableProps {
  result: QueryResult | null
}

/**
 * SQL 执行结果表（前端分页，NULL/BLOB 安全展示，最多 1000 行）。
 * 查询页与自定义视图页共用。
 */
export default function QueryResultTable({ result }: QueryResultTableProps) {
  const columns = useMemo(
    () => [
      {
        title: '#',
        key: '__row',
        width: 60,
        render: (_: unknown, r: Record<string, unknown>) => (
          <span className="cell-number">{String(r.__row)}</span>
        )
      },
      ...(result?.columns ?? []).map(c => ({
        title: c,
        dataIndex: c,
        key: c,
        ellipsis: true,
        render: (v: unknown) => <CellValue value={v} />
      }))
    ],
    [result]
  )

  if (!result) return null

  return (
    <>
      <div className="query-result-meta">
        <Space size="middle" wrap>
          <Tag color="blue">{result.total.toLocaleString()} 行</Tag>
          {result.truncated && <Tag color="orange">超过 1000 行，仅显示前 1000 行</Tag>}
        </Space>
      </div>
      <Table<Record<string, unknown>>
        size="small"
        columns={columns}
        dataSource={result.rows}
        rowKey="__row"
        scroll={{ x: 'max-content' }}
        pagination={{
          size: 'medium',
          showSizeChanger: true,
          showTotal: t => `共 ${t.toLocaleString()} 行`
        }}
      />
    </>
  )
}

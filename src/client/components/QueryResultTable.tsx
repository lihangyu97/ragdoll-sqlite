import { Descriptions, Modal, Space, Table, Tag } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import type { QueryResult } from '@shared/types'
import CellValue from '@/components/CellValue'

interface QueryResultTableProps {
  result: QueryResult | null
  /** 行详情弹窗标题前缀（自定义视图名等），默认「查询结果」 */
  title?: string
}

/**
 * SQL 执行结果表（前端分页，NULL/BLOB 安全展示，最多 1000 行）。
 * 查询页与自定义视图页共用；点击行弹出该行完整详情（与表数据页一致）。
 */
export default function QueryResultTable({ result, title = '查询结果' }: QueryResultTableProps) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  // 执行新查询后关闭残留的行详情（表数据页靠 key 重挂载规避，这里显式清理）
  useEffect(() => {
    queueMicrotask(() => setDetail(null))
  }, [result])

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
        // 截断统一由 CellValue 处理（最长 30 字符省略号）
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
        className="clickable-table"
        size="small"
        columns={columns}
        dataSource={result.rows}
        rowKey="__row"
        scroll={{ x: 'max-content' }}
        onRow={record => ({
          onClick: () => setDetail(record)
        })}
        pagination={{
          size: 'medium',
          showSizeChanger: true,
          showTotal: t => `共 ${t.toLocaleString()} 行`
        }}
      />

      <Modal
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={null}
        width={680}
        title={`${title} · 第 ${String(detail?.__row ?? '')} 行`}
      >
        {detail && (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={(result.columns ?? []).map(c => ({
              key: c,
              label: c,
              children: <CellValue value={detail[c]} full />
            }))}
          />
        )}
      </Modal>
    </>
  )
}

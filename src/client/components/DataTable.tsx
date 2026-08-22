import { Descriptions, Modal, Popover, Table, Tag, type TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'
import type { ColumnInfo, RowsResult } from '../../shared/types.js'
import CellValue, { cellFullText } from './CellValue.js'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100]

interface DataTableProps {
  tableName: string
  /** 列定义来自预取的 schema，切换表时立即可用 */
  columns: ColumnInfo[]
  /** 行数据可能尚未加载（null 时表格仅显示表头 + 内部 loading） */
  rows: RowsResult | null
  loading: boolean
  onPageChange: (page: number, pageSize: number) => void
}

/**
 * 「数据」Tab：分页表格（服务端分页，__row 为稳定行号）；点击行弹出该行详情。
 *
 * 列宽完全使用 antd 原生行为：scroll.x = 'max-content' 时，
 * 内容宽则横向滚动、内容窄则表格撑满容器，无需任何自定义宽度计算。
 * 超长文本由 ellipsis 截断 + hover Popover 看全文。
 */
export default function DataTable({
  tableName,
  columns,
  rows,
  loading,
  onPageChange
}: DataTableProps) {
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  // 切换表时关闭残留的行详情弹窗（旧记录与新表字段不匹配）
  useEffect(() => {
    setDetail(null)
  }, [tableName])

  const tableColumns: TableColumnsType<Record<string, unknown>> = [
    {
      title: '#',
      key: '__row',
      width: 60,
      render: (_v, record) => <span className="cell-number">{String(record.__row)}</span>
    },
    ...columns.map((c: ColumnInfo) => ({
      title: (
        <Popover
          trigger="hover"
          content={
            <span>
              {c.name}
              {c.type ? ` : ${c.type}` : ''}
              {c.pk > 0 ? '（主键）' : ''}
              {c.notNull ? '（非空）' : ''}
            </span>
          }
        >
          <span>{c.name}</span>
        </Popover>
      ),
      dataIndex: c.name,
      key: c.name,
      // 关闭原生 title，统一用 Popover 展示完整内容
      ellipsis: { showTitle: false },
      render: (v: unknown) => (
        // 所有单元格统一 hover Popover 看完整内容（包原生 span 让 Popover 挂载 hover 事件）
        <Popover trigger="hover" content={<div className="cell-popover-content">{cellFullText(v)}</div>}>
          <span>
            <CellValue value={v} />
          </span>
        </Popover>
      )
    }))
  ]

  return (
    <>
      <Table<Record<string, unknown>>
        className="data-table"
        size="small"
        columns={tableColumns}
        dataSource={rows?.rows ?? []}
        rowKey="__row"
        loading={loading}
        scroll={{ x: 'max-content' }}
        onRow={record => ({
          onClick: () => setDetail(record)
        })}
        pagination={
          rows
            ? {
                // 显式指定分页器 size（否则会继承表格的 small，显得局促）
                size: 'medium',
                current: rows.page,
                pageSize: rows.pageSize,
                total: rows.total,
                showSizeChanger: true,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                showTotal: total => `共 ${total.toLocaleString()} 行`,
                onChange: onPageChange
              }
            : false
        }
      />

      <Modal
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={null}
        width={680}
        title={`${tableName} · 第 ${String(detail?.__row ?? '')} 行`}
      >
        {detail && (
          <Descriptions
            bordered
            size="small"
            column={1}
            items={columns.map(c => ({
              key: c.name,
              label: (
                <span>
                  {c.name} {c.type ? <Tag>{c.type}</Tag> : null}
                </span>
              ),
              children: <CellValue value={detail[c.name]} full />
            }))}
          />
        )}
      </Modal>
    </>
  )
}

import { Descriptions, Modal, Popover, Table, Tag, type TableColumnsType } from 'antd'
import { useEffect, useState } from 'react'
import type { ColumnInfo, RowsResult } from '../../shared/types.js'
import CellValue, { cellText } from './CellValue.js'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100]
const MAX_COLUMN_WIDTH = 180
/** 超过该显示宽度的文本单元格，hover 时用 Popover 展示完整内容（CJK 按 2 字符计） */
const HOVER_POPOVER_MIN_WIDTH = 24

/** 文本显示宽度：CJK/全角字符算 2，其余算 1 */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 2 : 1
  }
  return w
}

/** 按字段类型估算列宽：长文本封顶 180px，数值/时间列收窄 */
function columnWidth(c: ColumnInfo): number {
  const t = c.type.toUpperCase()
  if (t.includes('INT')) return 90
  if (
    t.includes('REAL') ||
    t.includes('FLOA') ||
    t.includes('DOUB') ||
    t.includes('DEC') ||
    t.includes('NUM')
  ) {
    return 110
  }
  if (t.includes('BLOB')) return 120
  if (t.includes('DATE') || t.includes('TIME')) return 160
  return MAX_COLUMN_WIDTH
}

interface DataTableProps {
  tableName: string
  /** 列定义来自预取的 schema，切换表时立即可用 */
  columns: ColumnInfo[]
  /** 行数据可能尚未加载（null 时表格仅显示表头 + 内部 loading） */
  rows: RowsResult | null
  loading: boolean
  onPageChange: (page: number, pageSize: number) => void
}

/** 「数据」Tab：分页表格（服务端分页，__row 为稳定行号）；点击行弹出该行详情 */
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

  // 表格总宽 = 行号列 + 各列宽（数值 scroll.x 使列宽严格按 colgroup 生效）
  const totalWidth = 60 + columns.reduce((sum, c) => sum + columnWidth(c), 0)

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
      width: columnWidth(c),
      // 关闭原生 title，统一用 Popover 展示完整内容
      ellipsis: { showTitle: false },
      render: (v: unknown) => {
        const text = cellText(v)
        // 长内容：包一层原生 span 让 Popover 能挂载 hover 事件（CellValue 不转发 props）
        if (displayWidth(text) > HOVER_POPOVER_MIN_WIDTH) {
          return (
            <Popover trigger="hover" content={<div className="cell-popover-content">{text}</div>}>
              <span>
                <CellValue value={v} />
              </span>
            </Popover>
          )
        }
        return <CellValue value={v} />
      }
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
        scroll={{ x: totalWidth }}
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

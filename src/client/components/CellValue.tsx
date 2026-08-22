import { Popover } from 'antd'
import type { ReactNode } from 'react'
import type { BlobValue } from '../../shared/types.js'

export function isBlobValue(value: unknown): value is BlobValue {
  return typeof value === 'object' && value !== null && (value as BlobValue).__blob === true
}

/** 单元格的展示文本（供 hover Popover 与行详情复用） */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (isBlobValue(value)) return `BLOB(${value.bytes} bytes)`
  return String(value)
}

interface CellValueProps {
  value: unknown
  /** 完整模式（行详情对话框）：BLOB 展示完整 hex 预览 */
  full?: boolean
}

/** 单元格值渲染：NULL 灰显、BLOB 摘要、数字等宽 */
export default function CellValue({ value, full = false }: CellValueProps): ReactNode {
  if (value === null || value === undefined) {
    return <span className="cell-null">NULL</span>
  }
  if (isBlobValue(value)) {
    if (full) {
      const truncated = value.bytes > 16
      return (
        <span className="cell-blob">
          BLOB({value.bytes} bytes)
          {truncated && <span className="cell-null">（hex 仅显示前 16 字节）</span>}
          {value.hex && (
            <>
              <br />
              <span style={{ fontSize: 12 }}>hex: {value.hex}</span>
            </>
          )}
        </span>
      )
    }
    const preview =
      value.hex.length > 0 ? `hex: ${value.hex}${value.bytes > 16 ? '…' : ''}` : '（空 BLOB）'
    return (
      <Popover trigger="hover" content={<span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{preview}</span>}>
        <span className="cell-blob">BLOB({value.bytes} bytes)</span>
      </Popover>
    )
  }
  const str = String(value)
  return typeof value === 'number' ? (
    <span className="cell-number">{str}</span>
  ) : (
    <span className="cell-text">{str}</span>
  )
}

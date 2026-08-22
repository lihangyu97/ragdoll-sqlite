import type { ReactNode } from 'react'
import type { BlobValue } from '../../shared/types.js'

export function isBlobValue(value: unknown): value is BlobValue {
  return typeof value === 'object' && value !== null && (value as BlobValue).__blob === true
}

/** 单元格 hover 的完整展示文本：BLOB 带 hex 预览，其余为原始字符串 */
export function cellFullText(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (isBlobValue(value)) {
    const truncated = value.bytes > 16
    const hex = value.hex.length > 0 ? ` · hex: ${value.hex}${truncated ? '…' : ''}` : ''
    return `BLOB(${value.bytes} bytes)${hex}${truncated ? '（仅显示前 16 字节）' : ''}`
  }
  return String(value)
}

interface CellValueProps {
  value: unknown
  /** 完整模式（行详情对话框）：BLOB 展示完整 hex 预览 */
  full?: boolean
}

/** 单元格值渲染：NULL 灰显、BLOB 摘要、数字等宽（hover 的完整内容由外层 Popover 提供） */
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
    return <span className="cell-blob">BLOB({value.bytes} bytes)</span>
  }
  const str = String(value)
  return typeof value === 'number' ? (
    <span className="cell-number">{str}</span>
  ) : (
    <span className="cell-text">{str}</span>
  )
}

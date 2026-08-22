import { Tooltip } from 'antd'
import type { ReactNode } from 'react'
import type { BlobValue } from '../../shared/types.js'

/** 单元格值渲染：NULL 灰显、BLOB 摘要（悬停看 hex 预览）、数字等宽 */
export default function CellValue({ value }: { value: unknown }): ReactNode {
  if (value === null || value === undefined) {
    return <span className="cell-null">NULL</span>
  }
  if (typeof value === 'object' && value !== null && (value as BlobValue).__blob) {
    const blob = value as BlobValue
    const preview =
      blob.hex.length > 0 ? `hex: ${blob.hex}${blob.bytes > 16 ? '…' : ''}` : '（空 BLOB）'
    return (
      <Tooltip title={preview}>
        <span className="cell-blob">BLOB({blob.bytes} bytes)</span>
      </Tooltip>
    )
  }
  const str = String(value)
  return typeof value === 'number' ? (
    <span className="cell-number">{str}</span>
  ) : (
    <span className="cell-text">{str}</span>
  )
}

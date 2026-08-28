import type { ReactNode } from 'react'
import type { BlobValue } from '@shared/types'

export function isBlobValue(value: unknown): value is BlobValue {
  return typeof value === 'object' && value !== null && (value as BlobValue).__blob === true
}

interface CellValueProps {
  value: unknown
  /** 完整模式（行详情对话框）：不截断，BLOB 展示完整 hex 预览 */
  full?: boolean
}

/**
 * 单元格值渲染（所有数据表的统一渲染入口）：
 * NULL 灰显、BLOB 摘要、数字等宽；
 * 非 full 模式统一「最长 30 字符（30ch）+ 省略号」，短内容保持自然宽度。
 * 完整内容可通过点击行弹出的详情查看（DataTable 行详情 / 查询页按需）。
 */
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
  const cls = typeof value === 'number' ? 'cell-number' : 'cell-text'
  // 非 full 模式：最长 30 字符 + 省略号（见全局 .cell-clip）
  return <span className={full ? cls : `${cls} cell-clip`}>{str}</span>
}

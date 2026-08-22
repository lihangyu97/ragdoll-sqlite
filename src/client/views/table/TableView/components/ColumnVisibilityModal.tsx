import { Checkbox, Modal, Typography } from 'antd'
import type { ColumnInfo } from '@shared/types'

interface ColumnVisibilityModalProps {
  open: boolean
  /** 全部字段（含 BLOB，隐藏 BLOB 列同样合法） */
  columns: ColumnInfo[]
  /** 当前隐藏的列 */
  hidden: ReadonlySet<string>
  onCancel: () => void
  onToggle: (name: string) => void
}

/** 字段显示设置：勾选=显示，取消勾选=隐藏（仅前端，实时生效） */
export default function ColumnVisibilityModal({
  open,
  columns,
  hidden,
  onCancel,
  onToggle
}: ColumnVisibilityModalProps) {
  const visibleCount = columns.length - hidden.size

  return (
    <Modal open={open} title="字段显示" footer={null} onCancel={onCancel}>
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        已显示 {visibleCount} / {columns.length} 个字段（取消勾选即隐藏）
      </Typography.Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
        {columns.map(c => (
          <Checkbox
            key={c.name}
            checked={!hidden.has(c.name)}
            style={{ marginLeft: 0, whiteSpace: 'nowrap' }}
            onChange={() => onToggle(c.name)}
          >
            {c.name}
            {c.type ? <Typography.Text type="secondary"> : {c.type}</Typography.Text> : null}
          </Checkbox>
        ))}
      </div>
    </Modal>
  )
}

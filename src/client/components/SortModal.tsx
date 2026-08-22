import { Button, Form, Modal, Radio, Select } from 'antd'
import { useEffect, useMemo } from 'react'
import type { ColumnInfo, SortSpec } from '../../shared/types.js'
import { queryableColumns } from '../columnUtils.js'

interface SortModalProps {
  open: boolean
  /** 表结构（生成可排序字段列表） */
  columns: ColumnInfo[]
  /** 当前排序（打开时回填） */
  initial: SortSpec | null
  onCancel: () => void
  onApply: (sort: SortSpec | null) => void
}

interface SortFormValue {
  column?: string
  direction?: 'asc' | 'desc'
}

/** 排序弹窗：只允许选择可排序字段（除 BLOB 外），升序/降序 */
export default function SortModal({ open, columns, initial, onCancel, onApply }: SortModalProps) {
  const [form] = Form.useForm<SortFormValue>()
  const sortable = useMemo(() => queryableColumns(columns), [columns])

  // 打开时回填当前排序（无则默认第一个字段 + 升序）
  useEffect(() => {
    if (open) {
      form.setFieldsValue(
        initial
          ? { column: initial.column, direction: initial.direction }
          : { column: sortable[0]?.name, direction: 'asc' }
      )
    }
  }, [open, initial, sortable, form])

  const handleApply = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values || !values.column) return
    onApply({ column: values.column, direction: values.direction === 'desc' ? 'desc' : 'asc' })
  }

  return (
    <Modal
      open={open}
      title="排序"
      width={420}
      onCancel={onCancel}
      footer={[
        <Button key="clear" disabled={!initial} onClick={() => onApply(null)}>
          清除排序
        </Button>,
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="apply" type="primary" onClick={handleApply}>
          应用
        </Button>
      ]}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="column" label="排序字段">
          <Select
            placeholder="选择字段"
            options={sortable.map(c => ({ value: c.name, label: c.name }))}
          />
        </Form.Item>
        <Form.Item name="direction" label="方向">
          <Radio.Group>
            <Radio value="asc">升序 ↑</Radio>
            <Radio value="desc">降序 ↓</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  )
}

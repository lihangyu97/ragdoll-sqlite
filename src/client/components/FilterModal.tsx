import { CloseOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, InputNumber, Modal, Select, Space } from 'antd'
import { useEffect, useMemo } from 'react'
import type { ColumnInfo, FilterCondition, FilterOperator } from '../../shared/types.js'

interface FilterModalProps {
  open: boolean
  /** 表结构（生成表单依据） */
  columns: ColumnInfo[]
  /** 现有过滤条件（打开时回填） */
  initial: FilterCondition[]
  onCancel: () => void
  onSubmit: (filters: FilterCondition[]) => void
}

interface RowValue {
  column?: string
  op?: FilterOperator
  value?: unknown
}

const NUMERIC_OPS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gte', label: '≥' },
  { value: 'gt', label: '>' },
  { value: 'lte', label: '≤' },
  { value: 'lt', label: '<' },
  { value: 'isNull', label: '为空' },
  { value: 'isNotNull', label: '不为空' }
]

const TEXT_OPS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'like', label: '包含' },
  { value: 'isNull', label: '为空' },
  { value: 'isNotNull', label: '不为空' }
]

function isNumericType(c: ColumnInfo): boolean {
  return /INT|REAL|FLOA|DOUB|DEC|NUM/.test(c.type.toUpperCase())
}

/** 参与过滤的字段（BLOB 无法有意义地过滤，排除） */
function filterableColumns(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.filter(c => !c.type.toUpperCase().includes('BLOB'))
}

/** 按表结构生成过滤条件表单；只把填了值的行拼进 WHERE */
export default function FilterModal({
  open,
  columns,
  initial,
  onCancel,
  onSubmit
}: FilterModalProps) {
  const [form] = Form.useForm<{ rows: RowValue[] }>()
  const filterable = useMemo(() => filterableColumns(columns), [columns])
  const rowsWatch = Form.useWatch('rows', form)

  // 打开时回填现有条件（无则给一行空的）
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        rows:
          initial.length > 0
            ? initial.map(f => ({ column: f.column, op: f.op, value: f.value }))
            : [{ column: filterable[0]?.name }]
      })
    }
  }, [open, initial, filterable, form])

  const handleSubmit = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    const filters: FilterCondition[] = []
    for (const r of values.rows ?? []) {
      if (!r.column || !r.op) continue // 不完整的行跳过
      if (r.op === 'isNull' || r.op === 'isNotNull') {
        filters.push({ column: r.column, op: r.op })
      } else if (r.value !== undefined && r.value !== '') {
        filters.push({
          column: r.column,
          op: r.op,
          // 「包含」在客户端包上 % 通配符
          value: r.op === 'like' ? `%${r.value}%` : r.value
        })
      }
    }
    onSubmit(filters)
  }

  return (
    <Modal
      open={open}
      title="按列查询"
      width={560}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          查询
        </Button>
      ]}
    >
      <Form form={form} component={false}>
        <Form.List name="rows">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name }) => {
                const row = rowsWatch?.[name]
                const col = filterable.find(c => c.name === row?.column)
                const ops = col ? (isNumericType(col) ? NUMERIC_OPS : TEXT_OPS) : TEXT_OPS
                const needValue = row?.op !== 'isNull' && row?.op !== 'isNotNull'
                return (
                  <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item name={[name, 'column']} style={{ width: 160, marginBottom: 0 }}>
                      <Select
                        placeholder="字段"
                        options={filterable.map(c => ({ value: c.name, label: c.name }))}
                        onChange={() => {
                          form.setFieldValue(['rows', name, 'op'], undefined)
                          form.setFieldValue(['rows', name, 'value'], undefined)
                        }}
                      />
                    </Form.Item>
                    <Form.Item name={[name, 'op']} style={{ width: 110, marginBottom: 0 }}>
                      <Select placeholder="运算符" options={ops} />
                    </Form.Item>
                    {needValue && (
                      <Form.Item name={[name, 'value']} style={{ width: 180, marginBottom: 0 }}>
                        {col && isNumericType(col) ? (
                          <InputNumber style={{ width: '100%' }} placeholder="值" />
                        ) : (
                          <Input placeholder="值" />
                        )}
                      </Form.Item>
                    )}
                    <Button
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => remove(name)}
                    />
                  </Space>
                )
              })}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => add({ column: filterable[0]?.name })}
              >
                添加条件
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  )
}

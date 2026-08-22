import { Button, Tag } from 'antd'
import type { FilterCondition } from '../../shared/types.js'

const OP_TEXT: Record<string, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  like: '包含',
  isNull: '为空',
  isNotNull: '不为空'
}

function describe(f: FilterCondition): string {
  const op = OP_TEXT[f.op] ?? f.op
  if (f.op === 'isNull' || f.op === 'isNotNull') return `${f.column} ${op}`
  // like 的值带 % 通配符，展示时去掉
  const v = f.op === 'like' ? String(f.value).replace(/^%|%$/g, '') : String(f.value)
  return `${f.column} ${op} "${v}"`
}

interface FilterBarProps {
  filters: FilterCondition[]
  onRemove: (index: number) => void
  onClear: () => void
}

/**
 * 已生效的过滤条件标签（可单独移除 / 清除全部）。
 * 不包外层容器：由调用方与排序标签等组成同一条件条。
 */
export default function FilterBar({ filters, onRemove, onClear }: FilterBarProps) {
  return (
    <>
      {filters.map((f, i) => (
        <Tag key={`${f.column}-${i}`} color="blue" closable onClose={() => onRemove(i)}>
          {describe(f)}
        </Tag>
      ))}
      <Button type="link" size="small" style={{ paddingInline: 4 }} onClick={onClear}>
        清除全部
      </Button>
    </>
  )
}

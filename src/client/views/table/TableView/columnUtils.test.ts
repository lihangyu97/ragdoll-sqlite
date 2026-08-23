import { describe, expect, it } from 'vitest'
import type { ColumnInfo } from '@shared/types'
import { isQueryableColumn, queryableColumns } from './columnUtils'

const col = (name: string, type: string): ColumnInfo => ({
  cid: 0,
  name,
  type,
  notNull: false,
  defaultValue: null,
  pk: 0
})

describe('columnUtils', () => {
  it('BLOB 列不可参与过滤/排序，其余均可', () => {
    expect(isQueryableColumn(col('avatar', 'BLOB'))).toBe(false)
    expect(isQueryableColumn(col('name', 'TEXT'))).toBe(true)
    expect(isQueryableColumn(col('age', 'INTEGER'))).toBe(true)
  })

  it('queryableColumns 过滤出可查询列', () => {
    const columns = [col('id', 'INTEGER'), col('avatar', 'BLOB'), col('note', 'TEXT')]
    const result = queryableColumns(columns).map(c => c.name)
    expect(result).toEqual(['id', 'note'])
  })
})

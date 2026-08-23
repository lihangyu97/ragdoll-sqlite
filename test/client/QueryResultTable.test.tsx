import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { QueryResult } from '@shared/types'
import QueryResultTable from '@/components/QueryResultTable'

const result: QueryResult = {
  columns: ['id', 'name', 'avatar'],
  rows: [
    { id: 1, name: 'alice', avatar: { __blob: true, bytes: 3, hex: '010203' }, __row: 1 },
    { id: 2, name: null, avatar: null, __row: 2 }
  ],
  total: 2,
  truncated: false
}

describe('QueryResultTable', () => {
  it('result 为 null 时不渲染', () => {
    const { container } = render(<QueryResultTable result={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('渲染行数 Tag 与数据行（含 NULL 与 BLOB 单元格）', () => {
    render(<QueryResultTable result={result} />)
    expect(screen.getByText('2 行')).toBeTruthy()
    expect(screen.getByText('alice')).toBeTruthy()
    expect(screen.getAllByText('NULL').length).toBeGreaterThan(0)
    expect(screen.getByText('BLOB(3 bytes)')).toBeTruthy()
    // 行号列与 id 值各至少一个
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('truncated 时展示截断提示', () => {
    render(<QueryResultTable result={{ ...result, total: 2000, truncated: true }} />)
    expect(screen.getByText(/超过 1000 行/)).toBeTruthy()
    expect(screen.getByText('2,000 行')).toBeTruthy()
  })
})

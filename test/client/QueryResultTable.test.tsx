import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { QueryResult } from '@shared/types'
import QueryResultTable from '@/components/QueryResultTable'

// vitest 未开 globals，@testing-library 的自动 cleanup 不生效，需显式清理（否则多次 render 的 DOM 叠加）
afterEach(cleanup)

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

  it('点击行弹出完整详情（title 前缀 + 全字段 full 渲染，BLOB 带 hex）', async () => {
    render(<QueryResultTable result={result} title="视图A" />)
    fireEvent.click(screen.getByText('alice').closest('tr')!)
    expect(await screen.findByText('视图A · 第 1 行')).toBeTruthy()
    // BLOB 字段在弹窗中以完整模式展示 hex 预览
    expect(screen.getByText('hex: 010203')).toBeTruthy()
    // 弹窗内所有字段都在（表格中同样存在 alice，用 getAllByText）
    expect(screen.getAllByText('alice').length).toBeGreaterThan(0)
    expect(screen.getAllByText('NULL').length).toBeGreaterThan(0)
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CellValue, { cellFullText, isBlobValue } from './CellValue'

describe('CellValue', () => {
  it('NULL/undefined 渲染为斜体 NULL', () => {
    const { rerender } = render(<CellValue value={null} />)
    const el = screen.getByText('NULL')
    expect(el.className).toContain('cell-null')
    rerender(<CellValue value={undefined} />)
    expect(screen.getByText('NULL')).toBeTruthy()
  })

  it('BLOB 渲染字节数摘要（full 模式带 hex 预览）', () => {
    const blob = { __blob: true, bytes: 3, hex: '010203' }
    const { rerender } = render(<CellValue value={blob} />)
    const el = screen.getByText('BLOB(3 bytes)')
    expect(el.className).toContain('cell-blob')

    rerender(<CellValue value={blob} full />)
    expect(screen.getByText('hex: 010203')).toBeTruthy()
  })

  it('文本/数字原样渲染且带对应类', () => {
    const { rerender } = render(<CellValue value="hello" />)
    expect(screen.getByText('hello').className).toContain('cell-text')
    rerender(<CellValue value={42} />)
    expect(screen.getByText('42').className).toContain('cell-number')
    rerender(<CellValue value={false} />)
    expect(screen.getByText('false')).toBeTruthy()
  })

  it('isBlobValue / cellFullText 工具函数', () => {
    expect(isBlobValue({ __blob: true, bytes: 1, hex: '' })).toBe(true)
    expect(isBlobValue('x')).toBe(false)
    expect(isBlobValue(null)).toBe(false)
    expect(cellFullText(null)).toBe('NULL')
    expect(cellFullText(123)).toBe('123')
    expect(cellFullText({ __blob: true, bytes: 3, hex: '010203' })).toContain('BLOB(3 bytes)')
  })
})

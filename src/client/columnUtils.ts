import type { ColumnInfo } from '../shared/types.js'

/**
 * 字段是否可参与过滤/排序（BLOB 按字节序无意义，排除）。
 * 过滤与排序共用同一规则：除 BLOB 外均可。
 */
export function isQueryableColumn(c: ColumnInfo): boolean {
  return !c.type.toUpperCase().includes('BLOB')
}

/** 可参与过滤/排序的字段列表 */
export function queryableColumns(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.filter(isQueryableColumn)
}

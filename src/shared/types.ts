/** sqlite_master 中的表/视图条目 */
export interface TableEntry {
  name: string
  type: 'table' | 'view'
}

/** PRAGMA table_info 结果（映射后） */
export interface ColumnInfo {
  cid: number
  name: string
  type: string
  notNull: boolean
  defaultValue: unknown
  pk: number
}

/** PRAGMA foreign_key_list 结果（映射后） */
export interface ForeignKeyInfo {
  id: number
  seq: number
  table: string
  from: string
  to: string | null
  onUpdate: string
  onDelete: string
  match: string
}

/** 索引（PRAGMA index_list + index_info 展开） */
export interface IndexInfo {
  name: string
  unique: boolean
  origin: string
  partial: boolean
  columns: string[]
}

/** 单表完整结构 */
export interface TableInfo {
  name: string
  type: 'table' | 'view'
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
  indexes: IndexInfo[]
  rowCount: number
}

/** 分页数据结果 */
export interface RowsResult {
  total: number
  page: number
  pageSize: number
  rows: Record<string, unknown>[]
}

/** BLOB 值的序列化形态（UI 据此渲染） */
export interface BlobValue {
  __blob: true
  bytes: number
  hex: string
}

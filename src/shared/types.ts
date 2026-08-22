/** 过滤运算符 */
export type FilterOperator =
  'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'isNull' | 'isNotNull'

/** 单条过滤条件（isNull/isNotNull 无 value） */
export interface FilterCondition {
  column: string
  op: FilterOperator
  value?: unknown
}

/** sqlite_master 中的表/视图条目 */
export interface TableEntry {
  name: string
  type: 'table' | 'view'
}

/** 表/视图条目 + 字段（/api/tables 一次返回所有表头） */
export interface TableSchemaEntry extends TableEntry {
  columns: ColumnInfo[]
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

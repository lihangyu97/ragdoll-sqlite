/** 过滤运算符 */
export type FilterOperator =
  'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'isNull' | 'isNotNull'

/** 单条过滤条件（isNull/isNotNull 无 value） */
export interface FilterCondition {
  column: string
  op: FilterOperator
  value?: unknown
}

/** 排序方向 */
export type SortDirection = 'asc' | 'desc'

/** 排序规格 */
export interface SortSpec {
  column: string
  direction: SortDirection
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

/** 库总览中每张表/视图的行数 */
export interface OverviewTable {
  name: string
  type: 'table' | 'view'
  rowCount: number
}

/** 库总览（主页 Dashboard：表/视图行数、库文件大小） */
export interface Overview {
  dbSizeBytes: number
  tables: OverviewTable[]
  totalRows: number
}

/** 只读查询结果（SQL 控制台） */
export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  /** 查询实际返回的总行数（可能大于 rows.length，超上限时截断） */
  total: number
  truncated: boolean
}

/** 自定义视图（保存的命名 SQL，存于应用自己的 views.db） */
export interface CustomView {
  id: number
  name: string
  sql: string
  createdAt: string
  updatedAt: string
}

/** 最近打开的数据库 */
export interface RecentDatabase {
  path: string
  openedAt: string
}

/** 当前数据库信息 + 最近打开列表（主页展示/切换用） */
export interface DatabaseInfo {
  current: {
    path: string
    dbSizeBytes: number
    tableCount: number
    viewCount: number
    totalRows: number
    /** 每表行数（复用行数缓存） */
    tables: OverviewTable[]
  } | null
  recent: RecentDatabase[]
}

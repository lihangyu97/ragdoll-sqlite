import type {
  DatabaseInfo,
  FilterCondition,
  Overview,
  QueryResult,
  RowsResult,
  SortSpec,
  TableInfo,
  TableSchemaEntry
} from '../shared/types.js'
import type { SqliteDb } from './db.js'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './db.js'
import type { ViewsStore } from './views.js'

/** 带 HTTP 状态码的业务错误 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleTables(db: SqliteDb): TableSchemaEntry[] {
  return db.listSchemas()
}

/** 库总览（主页 Dashboard） */
export function handleOverview(db: SqliteDb): Overview {
  return db.overview()
}

/** 当前数据库信息 + 最近打开列表（主页展示/切换用） */
export function handleDatabaseInfo(db: SqliteDb, views: ViewsStore | null): DatabaseInfo {
  const overview = db.overview()
  return {
    current: {
      path: db.path,
      dbSizeBytes: overview.dbSizeBytes,
      tableCount: overview.tables.filter(t => t.type === 'table').length,
      viewCount: overview.tables.filter(t => t.type === 'view').length,
      totalRows: overview.totalRows,
      tables: overview.tables
    },
    recent: views ? views.listRecentDatabases() : []
  }
}

/** 切换数据库：只读打开新库（完整校验）并记录最近打开 */
export function handleSwitchDatabase(
  db: SqliteDb,
  views: ViewsStore | null,
  path: string
): DatabaseInfo {
  const trimmed = path.trim()
  if (!trimmed) throw new ApiError(400, '请输入数据库路径')
  try {
    db.reopen(trimmed)
  } catch (err) {
    throw new ApiError(400, (err as Error).message)
  }
  views?.addRecentDatabase(trimmed)
  return handleDatabaseInfo(db, views)
}

/** 只读查询（SQL 控制台） */
export function handleQuery(db: SqliteDb, sql: string): QueryResult {
  try {
    return db.query(sql)
  } catch (err) {
    throw new ApiError(400, (err as Error).message)
  }
}

/** 刷新：清空行数缓存（外部可能改过库），由客户端随后重新拉取数据 */
export function handleRefresh(db: SqliteDb): void {
  db.clearRowCountCache()
}

export function handleTableInfo(db: SqliteDb, name: string): TableInfo {
  if (!name) throw new ApiError(400, '缺少表名')
  try {
    return db.tableInfo(name)
  } catch (err) {
    throw new ApiError(404, (err as Error).message)
  }
}

export function handleRows(
  db: SqliteDb,
  name: string,
  pageRaw: string | null,
  pageSizeRaw: string | null,
  filterRaw: string | null,
  sortByRaw: string | null,
  sortDirRaw: string | null
): RowsResult {
  if (!name) throw new ApiError(400, '缺少表名')
  const page = pageRaw === null ? 1 : Number(pageRaw)
  const pageSize = pageSizeRaw === null ? DEFAULT_PAGE_SIZE : Number(pageSizeRaw)
  if (!Number.isInteger(page) || page < 1) {
    throw new ApiError(400, 'page 必须是 >= 1 的整数')
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ApiError(400, `pageSize 必须是 1-${MAX_PAGE_SIZE} 的整数`)
  }
  let filters: FilterCondition[] = []
  if (filterRaw) {
    try {
      const parsed: unknown = JSON.parse(filterRaw)
      if (!Array.isArray(parsed)) throw new Error('not array')
      filters = parsed as FilterCondition[]
    } catch {
      throw new ApiError(400, 'filter 参数必须是合法的 JSON 数组')
    }
  }
  let sort: SortSpec | null = null
  if (sortByRaw) {
    if (sortDirRaw && sortDirRaw !== 'asc' && sortDirRaw !== 'desc') {
      throw new ApiError(400, 'sortDir 必须是 asc 或 desc')
    }
    sort = { column: sortByRaw, direction: sortDirRaw === 'desc' ? 'desc' : 'asc' }
  }
  try {
    return db.rows(name, page, pageSize, filters, sort)
  } catch (err) {
    const msg = (err as Error).message
    // 表不存在 → 404；未知字段/运算符 → 400
    throw new ApiError(msg.includes('不存在') ? 404 : 400, msg)
  }
}

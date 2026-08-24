import type {
  DatabaseInfo,
  FilterCondition,
  QueryResult,
  RowsResult,
  SortSpec,
  TableInfo,
  TableSchemaEntry
} from '../shared/types.js'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SqliteDb } from './db.js'
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

/** 当前数据库信息 + 最近打开列表（主页展示/切换用）；未打开数据库时 current 为 null */
export function handleDatabaseInfo(db: SqliteDb | null, views: ViewsStore | null): DatabaseInfo {
  const recent = views ? views.listRecentDatabases() : []
  if (!db) return { current: null, recent }
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
    recent
  }
}

/**
 * 切换数据库：只读打开新库（完整校验）并记录最近打开。
 * 已打开过库时复用连接（reopen）；未打开过（db 为 null）则新建连接。
 * 返回新库连接 + 切换后的信息，由调用方持有新连接。
 */
export function handleSwitchDatabase(
  db: SqliteDb | null,
  views: ViewsStore | null,
  path: string
): { db: SqliteDb; info: DatabaseInfo } {
  const trimmed = path.trim()
  if (!trimmed) throw new ApiError(400, '请输入数据库路径')
  let next: SqliteDb
  if (db) {
    try {
      db.reopen(trimmed)
      next = db
    } catch (err) {
      throw new ApiError(400, (err as Error).message)
    }
  } else {
    try {
      next = SqliteDb.open(trimmed)
    } catch (err) {
      throw new ApiError(400, (err as Error).message)
    }
  }
  views?.addRecentDatabase(trimmed)
  return { db: next, info: handleDatabaseInfo(next, views) }
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

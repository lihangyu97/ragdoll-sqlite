import type { RowsResult, TableEntry, TableInfo } from '../shared/types.js'
import type { SqliteDb } from './db.js'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './db.js'

/** 带 HTTP 状态码的业务错误 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function handleTables(db: SqliteDb): TableEntry[] {
  return db.listTables()
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
  try {
    return db.rows(name, page, pageSize)
  } catch (err) {
    throw new ApiError(404, (err as Error).message)
  }
}

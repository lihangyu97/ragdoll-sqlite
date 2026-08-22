import Database from 'better-sqlite3'
import type {
  ColumnInfo,
  ForeignKeyInfo,
  IndexInfo,
  RowsResult,
  TableEntry,
  TableInfo,
} from '../shared/types.js'

export const MAX_PAGE_SIZE = 500
export const DEFAULT_PAGE_SIZE = 20

/** SQL 标识符双引号转义（表名在白名单校验后才插值，见 requireTable） */
function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

/** 将 better-sqlite3 返回的原生值转为 JSON 安全形态 */
export function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (Buffer.isBuffer(value)) {
    return {
      __blob: true,
      bytes: value.byteLength,
      hex: value.subarray(0, 16).toString('hex'),
    }
  }
  if (typeof value === 'bigint') return value.toString()
  return value
}

/** 只读 SQLite 连接封装：打开、探活、元数据、分页查询 */
export class SqliteDb {
  private readonly db: Database.Database

  private constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * 只读打开并探活。
   * 注意：非 SQLite 文件在只读模式下打开不会立即报错，必须主动执行一次查询来探测。
   */
  static open(path: string): SqliteDb {
    let db: Database.Database
    try {
      db = new Database(path, { readonly: true, fileMustExist: true })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`无法打开数据库（${detail}）`, { cause: err })
    }
    try {
      db.prepare('SELECT name FROM sqlite_master LIMIT 1').get()
    } catch (err) {
      db.close()
      throw new Error(`不是有效的 SQLite 数据库文件`, { cause: err })
    }
    return new SqliteDb(db)
  }

  /** 表/视图清单（排除 sqlite_% 内部表） */
  listTables(): TableEntry[] {
    return this.db
      .prepare(
        `SELECT name, type FROM sqlite_master
         WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as TableEntry[]
  }

  /** 表名白名单校验：仅接受 sqlite_master 中真实存在的表/视图名 */
  private requireTable(name: string): void {
    const found = this.db
      .prepare(`SELECT 1 FROM sqlite_master WHERE name = ? AND type IN ('table','view')`)
      .get(name)
    if (!found) {
      throw new Error(`表或视图不存在: ${name}`)
    }
  }

  /** 单表完整结构 */
  tableInfo(name: string): TableInfo {
    this.requireTable(name)
    const typeRow = this.db
      .prepare(`SELECT type FROM sqlite_master WHERE name = ?`)
      .get(name) as { type: 'table' | 'view' }

    const rawColumns = this.db
      .prepare(`SELECT * FROM pragma_table_info(?)`)
      .all(name) as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: unknown
      pk: number
    }>

    const rawFks = this.db
      .prepare(`SELECT * FROM pragma_foreign_key_list(?)`)
      .all(name) as Array<{
      id: number
      seq: number
      table: string
      from: string
      to: string | null
      on_update: string
      on_delete: string
      match: string
    }>

    const rawIndexes = this.db
      .prepare(`SELECT * FROM pragma_index_list(?)`)
      .all(name) as Array<{ name: string; unique: number; origin: string; partial: number }>

    const columns: ColumnInfo[] = rawColumns.map((c) => ({
      cid: c.cid,
      name: c.name,
      type: c.type,
      notNull: !!c.notnull,
      defaultValue: c.dflt_value,
      pk: c.pk,
    }))

    const foreignKeys: ForeignKeyInfo[] = rawFks.map((fk) => ({
      id: fk.id,
      seq: fk.seq,
      table: fk.table,
      from: fk.from,
      to: fk.to,
      onUpdate: fk.on_update,
      onDelete: fk.on_delete,
      match: fk.match,
    }))

    const indexes: IndexInfo[] = rawIndexes.map((r) => {
      const rawCols = this.db
        .prepare(`SELECT * FROM pragma_index_info(?)`)
        .all(r.name) as Array<{ name: string | null }>
      return {
        name: r.name,
        unique: !!r.unique,
        origin: r.origin,
        partial: !!r.partial,
        columns: rawCols.map((c) => c.name).filter((c): c is string => c !== null),
      }
    })

    const rowCount = (
      this.db.prepare(`SELECT count(*) AS c FROM ${quoteIdent(name)}`).get() as { c: number }
    ).c

    return { name, type: typeRow.type, columns, foreignKeys, indexes, rowCount }
  }

  /** 分页数据（已序列化为 JSON 安全形态） */
  rows(name: string, page: number, pageSize: number): RowsResult {
    this.requireTable(name)
    const safePage = Math.max(1, Math.floor(page) || 1)
    const safePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE),
    )
    const total = (
      this.db.prepare(`SELECT count(*) AS c FROM ${quoteIdent(name)}`).get() as { c: number }
    ).c
    const offset = (safePage - 1) * safePageSize
    const rows = this.db
      .prepare(`SELECT * FROM ${quoteIdent(name)} LIMIT ? OFFSET ?`)
      .all(safePageSize, offset) as Record<string, unknown>[]
    return {
      total,
      page: safePage,
      pageSize: safePageSize,
      // __row: 该页内 1 起的行号（全表唯一递增），供前端作为稳定的表格 rowKey 使用
      rows: rows.map((r, i) => {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(r)) out[k] = serializeValue(v)
        out.__row = offset + i + 1
        return out
      }),
    }
  }

  close(): void {
    this.db.close()
  }
}

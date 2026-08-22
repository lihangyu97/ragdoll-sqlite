import Database from 'better-sqlite3'
import type {
  ColumnInfo,
  FilterCondition,
  ForeignKeyInfo,
  IndexInfo,
  RowsResult,
  TableEntry,
  TableInfo,
  TableSchemaEntry
} from '../shared/types.js'

export const MAX_PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 20
/** 表数超过该值时，/api/tables 不再预取全部字段（由客户端按需加载，避免启动慢） */
export const SCHEMA_PREFETCH_THRESHOLD = 50

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
      hex: value.subarray(0, 16).toString('hex')
    }
  }
  if (typeof value === 'bigint') return value.toString()
  return value
}

/** 只读 SQLite 连接封装：打开、探活、元数据、分页查询 */
export class SqliteDb {
  private readonly db: Database.Database
  /** 行数缓存：只读打开，行数不会自行变化，首次 count(*) 后复用 */
  private readonly rowCountCache = new Map<string, number>()

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
         ORDER BY name`
      )
      .all() as TableEntry[]
  }

  /**
   * 全部表/视图及其字段（一次请求拿到所有表头，切换表时无需等待详情接口）。
   * 表数超过 SCHEMA_PREFETCH_THRESHOLD 时不预取字段（columns 为空数组），
   * 由客户端在选中表时通过详情接口按需加载，避免大库启动慢。
   */
  listSchemas(): TableSchemaEntry[] {
    const tables = this.listTables()
    if (tables.length > SCHEMA_PREFETCH_THRESHOLD) {
      return tables.map(t => ({ ...t, columns: [] }))
    }
    return tables.map(t => ({
      ...t,
      columns: this.columnsOf(t.name)
    }))
  }

  /** 表行数（只读库下缓存，重复调用不重复 count(*)） */
  private rowCount(name: string): number {
    const cached = this.rowCountCache.get(name)
    if (cached !== undefined) return cached
    const c = (
      this.db.prepare(`SELECT count(*) AS c FROM ${quoteIdent(name)}`).get() as { c: number }
    ).c
    this.rowCountCache.set(name, c)
    return c
  }

  /** 单表字段（PRAGMA table_info 映射） */
  private columnsOf(name: string): ColumnInfo[] {
    const rawColumns = this.db.prepare(`SELECT * FROM pragma_table_info(?)`).all(name) as Array<{
      cid: number
      name: string
      type: string
      notnull: number
      dflt_value: unknown
      pk: number
    }>
    return rawColumns.map(c => ({
      cid: c.cid,
      name: c.name,
      type: c.type,
      notNull: !!c.notnull,
      defaultValue: c.dflt_value,
      pk: c.pk
    }))
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
    const typeRow = this.db.prepare(`SELECT type FROM sqlite_master WHERE name = ?`).get(name) as {
      type: 'table' | 'view'
    }

    const rawFks = this.db.prepare(`SELECT * FROM pragma_foreign_key_list(?)`).all(name) as Array<{
      id: number
      seq: number
      table: string
      from: string
      to: string | null
      on_update: string
      on_delete: string
      match: string
    }>

    const rawIndexes = this.db.prepare(`SELECT * FROM pragma_index_list(?)`).all(name) as Array<{
      name: string
      unique: number
      origin: string
      partial: number
    }>

    const columns = this.columnsOf(name)

    const foreignKeys: ForeignKeyInfo[] = rawFks.map(fk => ({
      id: fk.id,
      seq: fk.seq,
      table: fk.table,
      from: fk.from,
      to: fk.to,
      onUpdate: fk.on_update,
      onDelete: fk.on_delete,
      match: fk.match
    }))

    const indexes: IndexInfo[] = rawIndexes.map(r => {
      const rawCols = this.db.prepare(`SELECT * FROM pragma_index_info(?)`).all(r.name) as Array<{
        name: string | null
      }>
      return {
        name: r.name,
        unique: !!r.unique,
        origin: r.origin,
        partial: !!r.partial,
        columns: rawCols.map(c => c.name).filter((c): c is string => c !== null)
      }
    })

    return {
      name,
      type: typeRow.type,
      columns,
      foreignKeys,
      indexes,
      rowCount: this.rowCount(name)
    }
  }

  /**
   * 分页数据（已序列化为 JSON 安全形态）。
   * filters：可选过滤条件（列名走表结构白名单校验，值全部参数化）。
   * 注意：过滤态不能复用行数缓存（缓存的是全表 count），无过滤时仍走缓存。
   */
  rows(name: string, page: number, pageSize: number, filters: FilterCondition[] = []): RowsResult {
    this.requireTable(name)
    const safePage = Math.max(1, Math.floor(page) || 1)
    const safePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE)
    )
    const { where, params } = this.buildWhere(name, filters)
    const total =
      filters.length === 0 ? this.rowCount(name) : this.countWithWhere(name, where, params)
    const offset = (safePage - 1) * safePageSize
    const rows = this.db
      .prepare(`SELECT * FROM ${quoteIdent(name)}${where} LIMIT ? OFFSET ?`)
      .all(...params, safePageSize, offset) as Record<string, unknown>[]
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
      })
    }
  }

  /**
   * 由过滤条件生成 WHERE 子句与参数。
   * 列名必须存在于该表的真实结构（白名单），运算符白名单，值全部参数化。
   */
  private buildWhere(
    name: string,
    filters: FilterCondition[]
  ): { where: string; params: unknown[] } {
    if (filters.length === 0) return { where: '', params: [] }
    const knownColumns = new Set(this.columnsOf(name).map(c => c.name))
    const clauses: string[] = []
    const params: unknown[] = []
    for (const f of filters) {
      if (!knownColumns.has(f.column)) {
        throw new Error(`未知字段: ${f.column}`)
      }
      const ident = quoteIdent(f.column)
      switch (f.op) {
        case 'eq':
          clauses.push(`${ident} = ?`)
          params.push(f.value)
          break
        case 'ne':
          clauses.push(`${ident} != ?`)
          params.push(f.value)
          break
        case 'gt':
          clauses.push(`${ident} > ?`)
          params.push(f.value)
          break
        case 'gte':
          clauses.push(`${ident} >= ?`)
          params.push(f.value)
          break
        case 'lt':
          clauses.push(`${ident} < ?`)
          params.push(f.value)
          break
        case 'lte':
          clauses.push(`${ident} <= ?`)
          params.push(f.value)
          break
        case 'like':
          clauses.push(`${ident} LIKE ? ESCAPE '\\'`)
          params.push(f.value)
          break
        case 'isNull':
          clauses.push(`${ident} IS NULL`)
          break
        case 'isNotNull':
          clauses.push(`${ident} IS NOT NULL`)
          break
        default:
          throw new Error(`不支持的运算符: ${f.op}`)
      }
    }
    return { where: ` WHERE ${clauses.join(' AND ')}`, params }
  }

  /** 带 WHERE 的 count（过滤态专用，不走行数缓存） */
  private countWithWhere(name: string, where: string, params: unknown[]): number {
    return (
      this.db.prepare(`SELECT count(*) AS c FROM ${quoteIdent(name)}${where}`).get(...params) as {
        c: number
      }
    ).c
  }

  close(): void {
    this.db.close()
  }
}

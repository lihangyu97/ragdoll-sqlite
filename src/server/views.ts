import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { CustomView } from '../shared/types.js'

/** 应用数据目录（用户主目录下，独立于被浏览的数据库，保持用户库只读） */
export function appDataDir(): string {
  return path.join(os.homedir(), '.ragdoll-sqlite')
}

/**
 * 应用自己的持久化存储（views.db）：
 * 存自定义视图（保存的命名 SQL）等应用数据，与被浏览的用户数据库完全隔离。
 *
 * 可扩展性预留：
 * - 后续新增需求（查询历史、设置、最近打开等）在同一个库加表即可；
 * - 表结构演进：新建列通过 CREATE TABLE IF NOT EXISTS 幂等执行 + 后续迁移；
 * - 自定义视图未来可加字段（分组、排序、描述），改表时用迁移而非重建。
 */
export class ViewsStore {
  private readonly db: Database.Database

  private constructor(db: Database.Database) {
    this.db = db
  }

  /** 打开（或创建）views.db；dbPath 缺省为应用数据目录下的 views.db（测试可注入） */
  static open(dbPath?: string): ViewsStore {
    const file = dbPath ?? path.join(appDataDir(), 'views.db')
    mkdirSync(path.dirname(file), { recursive: true })
    const db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        sql TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      -- SQL 编辑器草稿：单行表（id 恒为 1），跨会话保留上次编辑内容
      CREATE TABLE IF NOT EXISTS editor_drafts (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        sql TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    return new ViewsStore(db)
  }

  /** SQL 编辑器草稿（无记录时返回空串） */
  getDraft(): string {
    const row = this.db.prepare(`SELECT sql FROM editor_drafts WHERE id = 1`).get() as
      { sql: string } | undefined
    return row?.sql ?? ''
  }

  /** 保存 SQL 编辑器草稿（单行 upsert） */
  saveDraft(sql: string): void {
    this.db
      .prepare(
        `INSERT INTO editor_drafts (id, sql, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET sql = excluded.sql, updated_at = excluded.updated_at`
      )
      .run(sql)
  }

  /** 全部自定义视图（最近更新在前） */
  list(): CustomView[] {
    return this.db
      .prepare(
        `SELECT id, name, sql, created_at AS createdAt, updated_at AS updatedAt
         FROM custom_views ORDER BY updated_at DESC, id DESC`
      )
      .all() as CustomView[]
  }

  /** 新建自定义视图；name 唯一冲突时抛错 */
  create(name: string, sql: string): CustomView {
    const info = this.db
      .prepare(`INSERT INTO custom_views (name, sql) VALUES (?, ?)`)
      .run(name, sql)
    return this.byId(Number(info.lastInsertRowid))
  }

  /** 更新自定义视图（name/sql 至少一个）；返回更新后的完整行 */
  update(id: number, patch: { name?: string; sql?: string }): CustomView {
    const existing = this.byId(id)
    const name = patch.name ?? existing.name
    const sql = patch.sql ?? existing.sql
    this.db
      .prepare(
        `UPDATE custom_views SET name = ?, sql = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .run(name, sql, id)
    return this.byId(id)
  }

  /** 删除自定义视图（不存在时抛错） */
  remove(id: number): void {
    const info = this.db.prepare(`DELETE FROM custom_views WHERE id = ?`).run(id)
    if (info.changes === 0) throw new Error(`自定义视图不存在: ${id}`)
  }

  close(): void {
    this.db.close()
  }

  private byId(id: number): CustomView {
    const row = this.db
      .prepare(
        `SELECT id, name, sql, created_at AS createdAt, updated_at AS updatedAt
         FROM custom_views WHERE id = ?`
      )
      .get(id) as CustomView | undefined
    if (!row) throw new Error(`自定义视图不存在: ${id}`)
    return row
  }
}

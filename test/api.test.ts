import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { MAX_PAGE_SIZE, SqliteDb } from '../src/server/db.js'
import { startServer, type ServerHandle } from '../src/server/http.js'

let dir: string
let handle: ServerHandle
let token: string
let dbPath: string

function base(): string {
  return `http://127.0.0.1:${handle.port}`
}

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'ragdoll-api-test-'))
  dbPath = path.join(dir, 'fixture.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER, total REAL);
    INSERT INTO users (id, name) VALUES (1, 'alice'), (2, 'bob');
    INSERT INTO orders (id, user_id, total) VALUES (1, 1, 9.9), (2, 2, 19.9);
  `)
  db.close()

  // 静态目录：放一个假 index.html 供页面/静态测试
  const webDir = path.join(dir, 'web')
  mkdirSync(webDir, { recursive: true })
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>ragdoll-test</title>')

  handle = await startServer({ db: SqliteDb.open(dbPath), webDir, dev: false })
  token = new URL(handle.url).searchParams.get('t') ?? ''
})

after(async () => {
  await handle.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('HTTP API（真实服务器）', () => {
  it('无 token 访问 API 返回 403', async () => {
    const res = await fetch(`${base()}/api/tables`)
    assert.equal(res.status, 403)
  })

  it('带 token 返回表清单（含字段）', async () => {
    const res = await fetch(`${base()}/api/tables?t=${token}`)
    assert.equal(res.status, 200)
    const tables = (await res.json()) as Array<{ name: string; columns: Array<{ name: string }> }>
    assert.equal(tables.length, 2)
    const users = tables.find(t => t.name === 'users')!
    assert.deepEqual(
      users.columns.map(c => c.name),
      ['id', 'name']
    )
  })

  it('表结构接口返回行数与字段', async () => {
    const res = await fetch(`${base()}/api/tables/users?t=${token}`)
    assert.equal(res.status, 200)
    const info = (await res.json()) as { rowCount: number; columns: unknown[] }
    assert.equal(info.rowCount, 2)
    assert.equal(info.columns.length, 2)
  })

  it('分页接口返回总数与行数据', async () => {
    const res = await fetch(`${base()}/api/tables/users/rows?t=${token}&page=1&pageSize=10`)
    assert.equal(res.status, 200)
    const data = (await res.json()) as {
      total: number
      pageSize: number
      rows: Array<{ id: number }>
    }
    assert.equal(data.total, 2)
    assert.equal(data.pageSize, 10)
    assert.equal(data.rows.length, 2)
    assert.equal(data.rows[0].id, 1)
  })

  it('未知表 404；pageSize 超上限 400', async () => {
    const notFound = await fetch(`${base()}/api/tables/nope?t=${token}`)
    assert.equal(notFound.status, 404)
    const badParam = await fetch(`${base()}/api/tables/users/rows?t=${token}&pageSize=9999`)
    assert.equal(badParam.status, 400)
    const badPage = await fetch(`${base()}/api/tables/users/rows?t=${token}&page=0`)
    assert.equal(badPage.status, 400)
  })

  it('合法上限 pageSize 可用（=MAX_PAGE_SIZE）', async () => {
    const res = await fetch(`${base()}/api/tables/users/rows?t=${token}&pageSize=${MAX_PAGE_SIZE}`)
    assert.equal(res.status, 200)
    const data = (await res.json()) as { pageSize: number }
    assert.equal(data.pageSize, MAX_PAGE_SIZE)
  })

  it('首页带 token 返回 HTML；无 token 403', async () => {
    const page = await fetch(`${base()}/?t=${token}`)
    assert.equal(page.status, 200)
    assert.ok((await page.text()).includes('ragdoll-test'))
    assert.equal((await fetch(`${base()}/`)).status, 403)
  })

  it('路径穿越被拦截（URL 归一化后 404）', async () => {
    const res = await fetch(`${base()}/assets/../package.json?t=${token}`)
    assert.equal(res.status, 404)
  })
})

describe('db.rows 内部钳制', () => {
  it('pageSize 超 MAX_PAGE_SIZE 被钳制（不经 API 校验路径）', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const data = db.rows('users', 1, MAX_PAGE_SIZE * 10)
      assert.equal(data.pageSize, MAX_PAGE_SIZE)
    } finally {
      db.close()
    }
  })
})

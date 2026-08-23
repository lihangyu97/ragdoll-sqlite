import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { MAX_PAGE_SIZE, SqliteDb } from '../src/server/db.js'
import { startServer, type ServerHandle } from '../src/server/http.js'
import { ViewsStore } from '../src/server/views.js'

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
    CREATE TABLE "order&spec#al/name" (id INTEGER PRIMARY KEY, note TEXT);
    INSERT INTO users (id, name) VALUES (1, 'alice'), (2, 'bob');
    INSERT INTO orders (id, user_id, total) VALUES (1, 1, 9.9), (2, 2, 19.9);
    INSERT INTO "order&spec#al/name" (id, note) VALUES (1, 'x');
  `)
  db.close()

  // 静态目录：放一个假 index.html 供页面/静态测试
  const webDir = path.join(dir, 'web')
  mkdirSync(webDir, { recursive: true })
  writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>ragdoll-test</title>')

  // 应用存储：临时 views.db（测试隔离，不碰用户主目录）
  const views = ViewsStore.open(path.join(dir, 'views.db'))
  handle = await startServer({ db: SqliteDb.open(dbPath), webDir, dev: false, views })
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
    assert.equal(tables.length, 3)
    const users = tables.find(t => t.name === 'users')!
    assert.deepEqual(
      users.columns.map(c => c.name),
      ['id', 'name']
    )
  })

  it('GET /api/overview：返回每表行数、总行数与库文件大小', async () => {
    const res = await fetch(`${base()}/api/overview?t=${token}`)
    assert.equal(res.status, 200)
    const data = (await res.json()) as {
      dbSizeBytes: number
      totalRows: number
      tables: Array<{ name: string; type: string; rowCount: number }>
    }
    assert.ok(data.dbSizeBytes > 0, '库文件大小应为正数')
    assert.equal(data.totalRows, 5) // users 2 + orders 2 + 特殊表 1
    assert.equal(data.tables.length, 3)
    const users = data.tables.find(t => t.name === 'users')!
    assert.equal(users.rowCount, 2)
    // 行数走缓存：重复调用 totalRows 一致
    const again = (await (await fetch(`${base()}/api/overview?t=${token}`)).json()) as {
      totalRows: number
    }
    assert.equal(again.totalRows, 5)
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

  it('POST /api/query：只读 SELECT 返回列与行', async () => {
    const res = await fetch(`${base()}/api/query?t=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT id, name FROM users ORDER BY id' })
    })
    assert.equal(res.status, 200)
    const data = (await res.json()) as {
      columns: string[]
      rows: Array<Record<string, unknown>>
      total: number
      truncated: boolean
    }
    assert.deepEqual(data.columns, ['id', 'name'])
    assert.equal(data.total, 2)
    assert.equal(data.rows.length, 2)
    assert.equal(data.rows[0].id, 1)
    assert.equal(data.truncated, false)
  })

  it('POST /api/query：拒绝写语句与 PRAGMA（只读白名单）', async () => {
    const post = (sql: string) =>
      fetch(`${base()}/api/query?t=${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql })
      })
    for (const sql of [
      'DELETE FROM users',
      'INSERT INTO users VALUES (1)',
      'PRAGMA journal_mode',
      'ATTACH DATABASE'
    ]) {
      const res = await post(sql)
      assert.equal(res.status, 400, `应拒绝: ${sql}`)
    }
  })

  it('POST /api/query：语法错误返回 400', async () => {
    const res = await fetch(`${base()}/api/query?t=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT FROM' })
    })
    assert.equal(res.status, 400)
  })

  it('POST /api/query：超过 1000 行时截断并标记 truncated', async () => {
    const res = await fetch(`${base()}/api/query?t=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sql: 'WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 2000) SELECT x FROM cnt'
      })
    })
    assert.equal(res.status, 200)
    const data = (await res.json()) as { rows: unknown[]; total: number; truncated: boolean }
    assert.equal(data.total, 2000)
    assert.equal(data.rows.length, 1000)
    assert.equal(data.truncated, true)
  })

  it('filter 参数：过滤后返回正确 total 与行', async () => {
    const filter = encodeURIComponent(JSON.stringify([{ column: 'id', op: 'eq', value: 2 }]))
    const res = await fetch(`${base()}/api/tables/users/rows?t=${token}&filter=${filter}`)
    assert.equal(res.status, 200)
    const data = (await res.json()) as { total: number; rows: Array<{ id: number }> }
    assert.equal(data.total, 1)
    assert.equal(data.rows[0].id, 2)
  })

  it('filter 参数：非法 JSON / 未知字段返回 400', async () => {
    const bad = await fetch(`${base()}/api/tables/users/rows?t=${token}&filter=not-json`)
    assert.equal(bad.status, 400)
    const unknown = await fetch(
      `${base()}/api/tables/users/rows?t=${token}&filter=${encodeURIComponent(JSON.stringify([{ column: 'nope', op: 'eq', value: 1 }]))}`
    )
    assert.equal(unknown.status, 400)
  })

  it('sortBy/sortDir：排序生效，非法方向/未知字段 400', async () => {
    // id 降序 → 第一行 id=2
    const desc = await fetch(`${base()}/api/tables/users/rows?t=${token}&sortBy=id&sortDir=desc`)
    assert.equal(desc.status, 200)
    const descData = (await desc.json()) as { rows: Array<{ id: number }> }
    assert.equal(descData.rows[0].id, 2)

    // filter + sort 叠加
    const combined = await fetch(
      `${base()}/api/tables/users/rows?t=${token}&filter=${encodeURIComponent(JSON.stringify([{ column: 'id', op: 'gte', value: 1 }]))}&sortBy=id&sortDir=desc`
    )
    assert.equal(combined.status, 200)

    // 非法方向
    const badDir = await fetch(`${base()}/api/tables/users/rows?t=${token}&sortBy=id&sortDir=up`)
    assert.equal(badDir.status, 400)

    // 未知排序字段
    const unknownCol = await fetch(`${base()}/api/tables/users/rows?t=${token}&sortBy=nope`)
    assert.equal(unknownCol.status, 400)
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

  it('POST /api/refresh：清行数缓存；无 token 403、非 POST 405', async () => {
    const ok = await fetch(`${base()}/api/refresh?t=${token}`, { method: 'POST' })
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { ok: true })

    // 无 token
    assert.equal((await fetch(`${base()}/api/refresh`, { method: 'POST' })).status, 403)
    // GET 不允许
    assert.equal((await fetch(`${base()}/api/refresh?t=${token}`)).status, 405)

    // 刷新后数据仍可正常读取
    const rows = await fetch(`${base()}/api/tables/users/rows?t=${token}`)
    assert.equal(rows.status, 200)
  })

  it('路径穿越被拦截（URL 归一化后 404）', async () => {
    const res = await fetch(`${base()}/assets/../package.json?t=${token}`)
    assert.equal(res.status, 404)
  })

  it('表名含特殊字符（/ & #）编码后仍可访问结构/数据', async () => {
    const encoded = encodeURIComponent('order&spec#al/name') // order%26spec%23al%2Fname
    const info = await fetch(`${base()}/api/tables/${encoded}?t=${token}`)
    assert.equal(info.status, 200)
    const infoData = (await info.json()) as { name: string; rowCount: number }
    assert.equal(infoData.name, 'order&spec#al/name')
    assert.equal(infoData.rowCount, 1)

    const rows = await fetch(`${base()}/api/tables/${encoded}/rows?t=${token}&page=1&pageSize=10`)
    assert.equal(rows.status, 200)
    const data = (await rows.json()) as { total: number; rows: Array<{ note: string }> }
    assert.equal(data.total, 1)
    assert.equal(data.rows[0].note, 'x')
  })

  it('自定义视图 CRUD：创建 → 列表 → 更新 → 删除', async () => {
    const post = (body: unknown) =>
      fetch(`${base()}/api/views?t=${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })

    // 创建两个
    const a = await post({ name: '活跃用户', sql: 'SELECT * FROM users WHERE id > 0' })
    assert.equal(a.status, 201)
    const va = (await a.json()) as { id: number; name: string; sql: string }
    assert.equal(va.name, '活跃用户')

    const b = await post({ name: '订单汇总', sql: 'SELECT COUNT(*) AS n FROM orders' })
    assert.equal(b.status, 201)
    const vb = (await b.json()) as { id: number }

    // 列表：最近更新在前
    const list = await fetch(`${base()}/api/views?t=${token}`)
    assert.equal(list.status, 200)
    const views = (await list.json()) as Array<{ id: number; name: string; createdAt: string }>
    assert.equal(views.length, 2)
    assert.equal(views[0].name, '订单汇总') // 后创建的在前
    assert.ok(views[0].createdAt)

    // 更新名称与 SQL
    const up = await fetch(`${base()}/api/views/${va.id}?t=${token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '活跃用户 v2', sql: 'SELECT id, name FROM users' })
    })
    assert.equal(up.status, 200)
    const vu = (await up.json()) as { name: string; sql: string }
    assert.equal(vu.name, '活跃用户 v2')
    assert.equal(vu.sql, 'SELECT id, name FROM users')

    // 删除后列表只剩一个
    const del = await fetch(`${base()}/api/views/${va.id}?t=${token}`, { method: 'DELETE' })
    assert.equal(del.status, 200)
    const afterDel = (await (await fetch(`${base()}/api/views?t=${token}`)).json()) as Array<{
      id: number
    }>
    assert.equal(afterDel.length, 1)
    assert.equal(afterDel[0].id, vb.id)

    // 删除不存在的 → 404
    assert.equal(
      (await fetch(`${base()}/api/views/999?t=${token}`, { method: 'DELETE' })).status,
      404
    )
  })

  it('自定义视图校验：空 name/sql 400、重名 400', async () => {
    const post = (body: unknown) =>
      fetch(`${base()}/api/views?t=${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    assert.equal((await post({ name: '', sql: 'SELECT 1' })).status, 400)
    assert.equal((await post({ name: 'x', sql: '' })).status, 400)
    // 与上一条用例的「订单汇总」重名
    assert.equal((await post({ name: '订单汇总', sql: 'SELECT 1' })).status, 400)
  })

  it('SQL 草稿：默认空 → 保存 → 读取还原 → 覆盖', async () => {
    const get = async () =>
      ((await (await fetch(`${base()}/api/draft?t=${token}`)).json()) as { sql: string }).sql
    const put = (sql: string) =>
      fetch(`${base()}/api/draft?t=${token}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sql })
      })

    assert.equal(await get(), '')
    assert.equal((await put('SELECT * FROM users WHERE id = 2')).status, 200)
    assert.equal(await get(), 'SELECT * FROM users WHERE id = 2')
    assert.equal((await put('SELECT 1')).status, 200)
    assert.equal(await get(), 'SELECT 1')
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

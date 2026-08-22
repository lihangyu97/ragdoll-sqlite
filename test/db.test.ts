import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import Database from 'better-sqlite3'
import { SCHEMA_PREFETCH_THRESHOLD, serializeValue, SqliteDb } from '../src/server/db.js'
import type { FilterOperator } from '../src/shared/types.js'

let dir: string
let dbPath: string

before(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'ragdoll-test-'))
  dbPath = path.join(dir, 'fixture.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      age INTEGER,
      score REAL,
      avatar BLOB,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      total REAL
    );
    CREATE INDEX idx_users_name ON users(name);
    CREATE UNIQUE INDEX idx_users_age ON users(age) WHERE age IS NOT NULL;
    CREATE VIEW adult_users AS SELECT id, name FROM users WHERE age >= 18;
    CREATE TABLE "weird""name" (a INTEGER);
  `)
  const insert = db.prepare('INSERT INTO users (name, age, score, avatar) VALUES (?, ?, ?, ?)')
  for (let i = 1; i <= 35; i++) {
    // age 保持唯一（fixture 里有 UNIQUE 索引）
    insert.run(`user-${i}`, 18 + i, i * 1.5, i % 3 === 0 ? Buffer.from([i, i + 1]) : null)
  }
  db.close()
})

after(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('SqliteDb', () => {
  it('只读打开并列出表/视图（排除 sqlite_% 内部表）', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const names = db.listTables().map(t => t.name)
      assert.ok(names.includes('users'))
      assert.ok(names.includes('orders'))
      assert.ok(names.includes('adult_users'))
      assert.ok(names.includes('weird"name'))
      assert.ok(!names.some(n => n.startsWith('sqlite_')))
      assert.deepEqual(
        db
          .listTables()
          .filter(t => t.type === 'view')
          .map(v => v.name),
        ['adult_users']
      )
    } finally {
      db.close()
    }
  })

  it('tableInfo 返回字段/外键/索引/行数', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const users = db.tableInfo('users')
      assert.equal(users.type, 'table')
      assert.equal(users.columns.length, 6)
      const id = users.columns.find(c => c.name === 'id')!
      assert.equal(id.pk, 1)
      const name = users.columns.find(c => c.name === 'name')!
      assert.equal(name.notNull, true)
      assert.equal(users.rowCount, 35)

      const orders = db.tableInfo('orders')
      assert.equal(orders.foreignKeys.length, 1)
      const fk = orders.foreignKeys[0]
      assert.equal(fk.table, 'users')
      assert.equal(fk.from, 'user_id')
      assert.equal(fk.to, 'id')
      assert.equal(fk.onDelete, 'CASCADE')

      const indexNames = users.indexes.map(i => i.name).sort()
      assert.deepEqual(indexNames, ['idx_users_age', 'idx_users_name'])
      const ageIdx = users.indexes.find(i => i.name === 'idx_users_age')!
      assert.equal(ageIdx.unique, true)
      assert.equal(ageIdx.partial, true)
      assert.deepEqual(ageIdx.columns, ['age'])
      const nameIdx = users.indexes.find(i => i.name === 'idx_users_name')!
      assert.equal(nameIdx.unique, false)
      assert.deepEqual(nameIdx.columns, ['name'])
    } finally {
      db.close()
    }
  })

  it('视图结构可用', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const view = db.tableInfo('adult_users')
      assert.equal(view.type, 'view')
      assert.deepEqual(
        view.columns.map(c => c.name),
        ['id', 'name']
      )
    } finally {
      db.close()
    }
  })

  it('listSchemas：一次返回全部表/视图的字段（不含行数）', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const schemas = db.listSchemas()
      assert.equal(schemas.length, db.listTables().length)
      const users = schemas.find(s => s.name === 'users')!
      assert.equal(users.type, 'table')
      assert.equal(users.columns.length, 6)
      assert.deepEqual(users.columns.map(c => c.name).slice(0, 3), ['id', 'name', 'age'])
      const view = schemas.find(s => s.name === 'adult_users')!
      assert.equal(view.type, 'view')
      assert.deepEqual(
        view.columns.map(c => c.name),
        ['id', 'name']
      )
      // 不包含行数字段
      assert.ok(!('rowCount' in users))
    } finally {
      db.close()
    }
  })

  it('listSchemas：超过阈值时不预取字段，未超过时正常预取', () => {
    // 大库：SCHEMA_PREFETCH_THRESHOLD + 1 张表
    const bigPath = path.join(dir, 'big.db')
    const big = new Database(bigPath)
    big.exec(
      Array.from(
        { length: SCHEMA_PREFETCH_THRESHOLD + 1 },
        (_, i) => `CREATE TABLE t${i} (a INTEGER);`
      ).join(' ')
    )
    big.close()
    const bigDb = SqliteDb.open(bigPath)
    try {
      const schemas = bigDb.listSchemas()
      assert.equal(schemas.length, SCHEMA_PREFETCH_THRESHOLD + 1)
      assert.ok(schemas.every(s => s.columns.length === 0)) // 未预取字段
    } finally {
      bigDb.close()
    }

    // 小库（现有 fixture）：字段齐全
    const small = SqliteDb.open(dbPath)
    try {
      const schemas = small.listSchemas()
      const users = schemas.find(s => s.name === 'users')!
      assert.ok(users.columns.length > 0)
    } finally {
      small.close()
    }
  })

  it('行数缓存：重复调用返回一致结果', () => {
    const db = SqliteDb.open(dbPath)
    try {
      assert.equal(db.tableInfo('users').rowCount, 35)
      assert.equal(db.rows('users', 1, 10).total, 35) // 复用缓存
      assert.equal(db.tableInfo('users').rowCount, 35) // 复用缓存
    } finally {
      db.close()
    }
  })

  it('过滤：eq/like/isNull/gte，参数化与总数正确', () => {
    const db = SqliteDb.open(dbPath)
    try {
      // eq
      const eq = db.rows('users', 1, 10, [{ column: 'id', op: 'eq', value: 5 }])
      assert.equal(eq.total, 1)
      assert.equal(eq.rows[0].id, 5)

      // like（name 含 user-1 → user-1 + user-10..user-19 = 11 条）
      const like = db.rows('users', 1, 10, [{ column: 'name', op: 'like', value: '%user-1%' }])
      assert.equal(like.total, 11)

      // gte（age >= 40 → 18+i>=40 → i>=22 → 14 条）
      const gte = db.rows('users', 1, 10, [{ column: 'age', op: 'gte', value: 40 }])
      assert.equal(gte.total, 14)

      // isNull（avatar 为 NULL → 35 - 11(有 blob) = 24 条）
      const isNull = db.rows('users', 1, 10, [{ column: 'avatar', op: 'isNull' }])
      assert.equal(isNull.total, 24)

      // 多条件 AND
      const multi = db.rows('users', 1, 10, [
        { column: 'age', op: 'gte', value: 40 },
        { column: 'avatar', op: 'isNotNull' }
      ])
      const all = db
        .rows('users', 1, 100)
        .rows.filter(r => Number(r.age) >= 40 && r.avatar !== null)
      assert.equal(multi.total, all.length)

      // 过滤态分页正确
      const page2 = db.rows('users', 2, 5, [{ column: 'age', op: 'gte', value: 40 }])
      assert.equal(page2.page, 2)
      assert.equal(page2.rows.length, Math.min(5, Math.max(0, 14 - 5)))
    } finally {
      db.close()
    }
  })

  it('过滤：未知字段/非法运算符抛错', () => {
    const db = SqliteDb.open(dbPath)
    try {
      assert.throws(
        () => db.rows('users', 1, 10, [{ column: 'nope', op: 'eq', value: 1 }]),
        /未知字段/
      )
      assert.throws(
        () =>
          db.rows('users', 1, 10, [
            { column: 'id', op: 'bad' as FilterOperator, value: 1 } // 非法运算符（绕过类型）
          ]),
        /不支持的运算符/
      )
    } finally {
      db.close()
    }
  })

  it('排序：asc/desc 顺序正确，可与过滤叠加', () => {
    const db = SqliteDb.open(dbPath)
    try {
      // age 升序 → id 1,2,3（age=19,20,21）
      const asc = db.rows('users', 1, 3, [], { column: 'age', direction: 'asc' })
      assert.deepEqual(
        asc.rows.map(r => r.id),
        [1, 2, 3]
      )

      // age 降序 → id 35,34,33（age=53,52,51）
      const desc = db.rows('users', 1, 3, [], { column: 'age', direction: 'desc' })
      assert.deepEqual(
        desc.rows.map(r => r.id),
        [35, 34, 33]
      )

      // 过滤 + 排序叠加：age >= 50 且降序 → 第一条 id=35
      const combined = db.rows('users', 1, 10, [{ column: 'age', op: 'gte', value: 50 }], {
        column: 'age',
        direction: 'desc'
      })
      assert.equal(combined.total, 4) // age 50..53
      assert.equal(combined.rows[0].id, 35)
      assert.equal(combined.rows[3].id, 32)
    } finally {
      db.close()
    }
  })

  it('排序：未知字段抛错', () => {
    const db = SqliteDb.open(dbPath)
    try {
      assert.throws(
        () => db.rows('users', 1, 10, [], { column: 'nope', direction: 'asc' }),
        /未知字段/
      )
    } finally {
      db.close()
    }
  })

  it('分页：总数与页码正确，BLOB 被序列化，__row 为全表唯一行号', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const page2 = db.rows('users', 2, 10)
      assert.equal(page2.total, 35)
      assert.equal(page2.page, 2)
      assert.equal(page2.pageSize, 10)
      assert.equal(page2.rows.length, 10)
      assert.equal(page2.rows[0].id, 11)
      // __row 连续且跨页不重复
      assert.deepEqual(
        page2.rows.map(r => r.__row),
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
      )

      const blobRow = page2.rows.find(r => r.avatar !== null) as {
        avatar: { __blob: true; bytes: number; hex: string }
      }
      assert.ok(blobRow)
      assert.equal(blobRow.avatar.__blob, true)
      assert.equal(blobRow.avatar.bytes, 2)

      const last = db.rows('users', 4, 10)
      assert.equal(last.rows.length, 5)
      assert.equal(last.rows[4].id, 35)
      assert.equal(last.rows[4].__row, 35)
    } finally {
      db.close()
    }
  })

  it('未知表抛错', () => {
    const db = SqliteDb.open(dbPath)
    try {
      assert.throws(() => db.tableInfo('nope'), /不存在/)
      assert.throws(() => db.rows('nope', 1, 10), /不存在/)
    } finally {
      db.close()
    }
  })

  it('含双引号的表名可正常访问（标识符转义）', () => {
    const db = SqliteDb.open(dbPath)
    try {
      const info = db.tableInfo('weird"name')
      assert.equal(info.columns.length, 1)
      assert.equal(db.rows('weird"name', 1, 10).total, 0)
    } finally {
      db.close()
    }
  })

  it('只读连接下写入被 SQLite 拒绝', () => {
    const db = SqliteDb.open(dbPath)
    try {
      assert.throws(() => {
        const raw = new Database(dbPath, { readonly: true })
        raw.prepare('DELETE FROM users').run()
      }, /readonly|只读/i)
    } finally {
      db.close()
    }
  })

  it('非 SQLite 文件：探活报错', () => {
    const badPath = path.join(dir, 'bad.db')
    writeFileSync(badPath, 'this is not a sqlite database at all')
    assert.throws(() => SqliteDb.open(badPath), /不是有效的 SQLite/)
  })
})

describe('serializeValue', () => {
  it('Buffer → __blob，bigint → 字符串，null/undefined → null', () => {
    assert.deepEqual(serializeValue(Buffer.from([1, 2, 3])), {
      __blob: true,
      bytes: 3,
      hex: '010203'
    })
    assert.equal(serializeValue(123n), '123')
    assert.equal(serializeValue(null), null)
    assert.equal(serializeValue(undefined), null)
    assert.equal(serializeValue('a'), 'a')
  })
})

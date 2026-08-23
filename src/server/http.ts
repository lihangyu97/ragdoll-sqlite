import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import {
  ApiError,
  handleDatabaseInfo,
  handleOverview,
  handleQuery,
  handleRefresh,
  handleRows,
  handleSwitchDatabase,
  handleTableInfo,
  handleTables
} from './api.js'
import type { SqliteDb } from './db.js'
import type { ViewsStore } from './views.js'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
}

export interface ServerHandle {
  port: number
  url: string
  close: () => Promise<void>
}

export interface ServerOptions {
  db: SqliteDb
  webDir: string
  dev: boolean
  port?: number
  /** 应用存储（自定义视图等）；null 表示不可用（打开失败时降级） */
  views?: ViewsStore | null
}

export async function startServer(options: ServerOptions): Promise<ServerHandle> {
  const token = options.dev ? 'dev' : randomBytes(16).toString('hex')
  const server = createServer((req, res) => {
    void handleRequest(options, token, req, res).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: '服务器内部错误' })
      else res.end()
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', resolve)
  })

  const { port } = server.address() as AddressInfo
  const url = `http://127.0.0.1:${port}/?t=${token}`
  return {
    port,
    url,
    close: () =>
      new Promise<void>(resolve => {
        server.close(() => resolve())
      })
  }
}

async function handleRequest(
  options: ServerOptions,
  token: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  // pathname 保持编码形式参与路由匹配：表名可能含编码的 %2F（/），
  // 若先整体解码会拆散路径段；匹配到的表名捕获组再单独解码
  const pathname = url.pathname

  // ---- API ----
  if (pathname.startsWith('/api/')) {
    if (!options.dev && url.searchParams.get('t') !== token) {
      sendJson(res, 403, { error: '无效的访问令牌' })
      return
    }
    // 当前数据库信息 + 最近打开（主页展示/切换）
    if (pathname === '/api/databases') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method Not Allowed' })
        return
      }
      sendJson(res, 200, handleDatabaseInfo(options.db, options.views ?? null))
      return
    }
    // 切换数据库（只读打开新库）
    if (pathname === '/api/databases/switch') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' })
        return
      }
      const body = await readJsonBody(req)
      const path = typeof body?.path === 'string' ? body.path : ''
      try {
        sendJson(res, 200, handleSwitchDatabase(options.db, options.views ?? null, path))
      } catch (err) {
        if (err instanceof ApiError) {
          sendJson(res, err.status, { error: err.message })
          return
        }
        throw err
      }
      return
    }
    // 刷新：清空服务端行数缓存（外部可能改过库）
    if (pathname === '/api/refresh') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' })
        return
      }
      handleRefresh(options.db)
      sendJson(res, 200, { ok: true })
      return
    }
    // 只读查询（SQL 控制台）
    if (pathname === '/api/query') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method Not Allowed' })
        return
      }
      const body = await readJsonBody(req)
      const sql = typeof body?.sql === 'string' ? body.sql : ''
      try {
        sendJson(res, 200, handleQuery(options.db, sql))
      } catch (err) {
        if (err instanceof ApiError) {
          sendJson(res, err.status, { error: err.message })
          return
        }
        throw err
      }
      return
    }
    // 自定义视图（应用存储）
    if (pathname === '/api/views' || /^\/api\/views\/\d+$/.test(pathname)) {
      await handleViewsApi(options.views ?? null, pathname, req, res)
      return
    }
    // SQL 编辑器草稿（应用存储）
    if (pathname === '/api/draft') {
      await handleDraftApi(options.views ?? null, req, res)
      return
    }
    await handleApi(options.db, pathname, url, res)
    return
  }

  // ---- 页面 ----
  if (pathname === '/' || pathname === '/index.html') {
    if (!options.dev && url.searchParams.get('t') !== token) {
      sendJson(res, 403, { error: '无效的访问令牌' })
      return
    }
    await serveStatic(options.webDir, '/index.html', res)
    return
  }

  // ---- 其他静态文件（bundle、favicon 等，不含数据，无需 token）----
  await serveStatic(options.webDir, pathname, res)
}

async function handleApi(
  db: SqliteDb,
  pathname: string,
  url: URL,
  res: ServerResponse
): Promise<void> {
  try {
    if (pathname === '/api/tables') {
      sendJson(res, 200, handleTables(db))
      return
    }
    if (pathname === '/api/overview') {
      sendJson(res, 200, handleOverview(db))
      return
    }
    const rowsMatch = pathname.match(/^\/api\/tables\/([^/]+)\/rows$/)
    if (rowsMatch) {
      const result = handleRows(
        db,
        decodeURIComponent(rowsMatch[1]),
        url.searchParams.get('page'),
        url.searchParams.get('pageSize'),
        url.searchParams.get('filter'),
        url.searchParams.get('sortBy'),
        url.searchParams.get('sortDir')
      )
      sendJson(res, 200, result)
      return
    }
    const infoMatch = pathname.match(/^\/api\/tables\/([^/]+)$/)
    if (infoMatch) {
      sendJson(res, 200, handleTableInfo(db, decodeURIComponent(infoMatch[1])))
      return
    }
    throw new ApiError(404, 'Not Found')
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message })
      return
    }
    throw err
  }
}

async function serveStatic(webDir: string, pathname: string, res: ServerResponse): Promise<void> {
  const rel = decodeURIComponent(pathname.replace(/^\/+/, ''))
  const filePath = path.normalize(path.join(webDir, rel))
  const webRoot = path.normalize(webDir)
  if (filePath !== webRoot && !filePath.startsWith(webRoot + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' })
    return
  }
  try {
    const data = await readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': pathname.endsWith('.html') ? 'no-store' : 'public, max-age=3600'
    })
    res.end(data)
  } catch {
    sendJson(res, 404, { error: 'Not Found' })
  }
}

/** 读取并解析 JSON 请求体（带大小上限，防滥用） */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
      if (data.length > 1_000_000) {
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!data) return resolve(null)
      try {
        resolve(JSON.parse(data) as Record<string, unknown>)
      } catch {
        resolve(null)
      }
    })
    req.on('error', reject)
  })
}

/** SQL 编辑器草稿：GET 读取、PUT 保存（单行，跨会话保留） */
async function handleDraftApi(
  store: ViewsStore | null,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!store) {
    sendJson(res, 500, { error: '应用存储不可用（views.db 打开失败）' })
    return
  }
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { sql: store.getDraft() })
      return
    }
    if (req.method === 'PUT') {
      const body = (await readJsonBody(req)) ?? {}
      const sql = typeof body.sql === 'string' ? body.sql : ''
      store.saveDraft(sql)
      sendJson(res, 200, { ok: true })
      return
    }
    throw new ApiError(405, 'Method Not Allowed')
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message })
      return
    }
    throw err
  }
}

/** 自定义视图 CRUD：GET/POST /api/views、PUT/DELETE /api/views/:id */
async function handleViewsApi(
  store: ViewsStore | null,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!store) {
    sendJson(res, 500, { error: '应用存储不可用（views.db 打开失败）' })
    return
  }
  const match = pathname.match(/^\/api\/views\/(\d+)$/)
  const id = match ? Number(match[1]) : null
  try {
    if (id === null) {
      if (req.method === 'GET') {
        sendJson(res, 200, store.list())
      } else if (req.method === 'POST') {
        const body = (await readJsonBody(req)) ?? {}
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const sql = typeof body.sql === 'string' ? body.sql.trim() : ''
        if (!name || !sql) throw new ApiError(400, 'name 与 sql 不能为空')
        try {
          sendJson(res, 201, store.create(name, sql))
        } catch {
          throw new ApiError(400, `自定义视图「${name}」已存在`)
        }
      } else {
        throw new ApiError(405, 'Method Not Allowed')
      }
      return
    }
    if (req.method === 'PUT') {
      const body = (await readJsonBody(req)) ?? {}
      const patch: { name?: string; sql?: string } = {}
      if (body.name !== undefined) {
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        if (!name) throw new ApiError(400, 'name 不能为空')
        patch.name = name
      }
      if (body.sql !== undefined) {
        const sql = typeof body.sql === 'string' ? body.sql.trim() : ''
        if (!sql) throw new ApiError(400, 'sql 不能为空')
        patch.sql = sql
      }
      if (Object.keys(patch).length === 0) throw new ApiError(400, '没有可更新的字段')
      try {
        sendJson(res, 200, store.update(id, patch))
      } catch (err) {
        const msg = (err as Error).message
        throw new ApiError(msg.includes('已存在') ? 400 : 404, msg)
      }
    } else if (req.method === 'DELETE') {
      try {
        store.remove(id)
      } catch (err) {
        throw new ApiError(404, (err as Error).message)
      }
      sendJson(res, 200, { ok: true })
    } else {
      throw new ApiError(405, 'Method Not Allowed')
    }
  } catch (err) {
    if (err instanceof ApiError) {
      sendJson(res, err.status, { error: err.message })
      return
    }
    throw err
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  })
  res.end(JSON.stringify(body))
}

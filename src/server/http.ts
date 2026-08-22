import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { ApiError, handleRows, handleTableInfo, handleTables } from './api.js'
import type { SqliteDb } from './db.js'

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
  '.woff': 'font/woff',
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
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

async function handleRequest(
  options: ServerOptions,
  token: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const pathname = decodeURIComponent(url.pathname)

  // ---- API ----
  if (pathname.startsWith('/api/')) {
    if (!options.dev && url.searchParams.get('t') !== token) {
      sendJson(res, 403, { error: '无效的访问令牌' })
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
  res: ServerResponse,
): Promise<void> {
  try {
    if (pathname === '/api/tables') {
      sendJson(res, 200, handleTables(db))
      return
    }
    const rowsMatch = pathname.match(/^\/api\/tables\/([^/]+)\/rows$/)
    if (rowsMatch) {
      const result = handleRows(
        db,
        rowsMatch[1],
        url.searchParams.get('page'),
        url.searchParams.get('pageSize'),
      )
      sendJson(res, 200, result)
      return
    }
    const infoMatch = pathname.match(/^\/api\/tables\/([^/]+)$/)
    if (infoMatch) {
      sendJson(res, 200, handleTableInfo(db, infoMatch[1]))
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
  const rel = pathname.replace(/^\/+/, '')
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
      'cache-control': pathname.endsWith('.html') ? 'no-store' : 'public, max-age=3600',
    })
    res.end(data)
  } catch {
    sendJson(res, 404, { error: 'Not Found' })
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(body))
}

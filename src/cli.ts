#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SqliteDb } from './server/db.js'
import { startServer } from './server/http.js'

const DEV_DEFAULT_PORT = 7860

interface CliOptions {
  dbPath: string
  dev: boolean
  port: number | null
}

function parseArgs(argv: string[]): CliOptions | { error: string } {
  const positional: string[] = []
  let dev = false
  let port: number | null = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dev') {
      dev = true
    } else if (arg === '--port' || arg === '-p') {
      const raw = argv[++i]
      const n = Number(raw)
      if (raw === undefined || !Number.isInteger(n) || n < 1 || n > 65535) {
        return { error: `无效端口: ${raw ?? ''}` }
      }
      port = n
    } else if (arg === '-h' || arg === '--help') {
      return { error: '__HELP__' }
    } else if (arg.startsWith('-')) {
      return { error: `未知参数: ${arg}` }
    } else {
      positional.push(arg)
    }
  }
  if (positional.length === 0) return { error: '缺少 SQLite 数据库路径参数' }
  if (positional.length > 1) return { error: `参数过多: ${positional.slice(1).join(' ')}` }
  return { dbPath: positional[0], dev, port }
}

function printUsage(): void {
  console.log(`
ragdoll-sqlite - 在浏览器中只读浏览 SQLite 数据库

用法:
  ragdoll-sqlite <sqlite 路径> [选项]

选项:
  -p, --port N   指定端口（默认随机）
  --dev          开发模式：跳过 token 校验、固定端口 ${DEV_DEFAULT_PORT}，
                 页面由 vite dev server (5173) 提供，需先运行 pnpm dev:web
  -h, --help     显示帮助
`)
}

function openBrowser(url: string): void {
  const platform = process.platform
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {
    console.log(`\n无法自动打开浏览器，请手动访问: ${url}`)
  })
  child.unref()
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2))
  if ('error' in parsed) {
    if (parsed.error === '__HELP__') {
      printUsage()
      return
    }
    console.error(`错误: ${parsed.error}\n`)
    printUsage()
    process.exit(1)
  }

  const { dbPath, dev, port } = parsed

  if (!existsSync(dbPath)) {
    console.error(`错误: 文件不存在: ${dbPath}`)
    process.exit(1)
  }
  if (!statSync(dbPath).isFile()) {
    console.error(`错误: 不是文件: ${dbPath}`)
    process.exit(1)
  }

  let db: SqliteDb
  try {
    db = SqliteDb.open(dbPath)
  } catch (err) {
    console.error(`错误: ${(err as Error).message}`)
    process.exit(1)
  }

  // 静态资源目录：dist/web（vite build 产物，与 cli.js 同级）
  const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web')

  let server
  try {
    const finalPort = dev ? (port ?? DEV_DEFAULT_PORT) : (port ?? 0)
    server = await startServer({ db, webDir, dev, port: finalPort })
  } catch (err) {
    console.error(`错误: 无法启动服务: ${(err as Error).message}`)
    db.close()
    process.exit(1)
  }

  if (dev) {
    const pageUrl = `http://127.0.0.1:5173/?t=dev`
    console.log(`\n[dev] API 服务: http://127.0.0.1:${server.port}/`)
    console.log(`[dev] 前端页面: ${pageUrl}（请先运行 pnpm dev:web）`)
    openBrowser(pageUrl)
  } else {
    console.log(`\n正在打开: ${server.url}`)
    console.log(`（按 Ctrl+C 退出）`)
    openBrowser(server.url)
  }

  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n正在退出…')
    void server.close().then(() => {
      db.close()
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

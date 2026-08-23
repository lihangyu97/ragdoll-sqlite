#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEV_API_PORT } from './shared/constants.js'
import { SqliteDb } from './server/db.js'
import { startServer } from './server/http.js'
import { ViewsStore } from './server/views.js'

interface CliOptions {
  dbPath: string
  dev: boolean
  port: number | null
  open: boolean
}

function parseArgs(argv: string[], envDb?: string): CliOptions | { error: string } {
  const positional: string[] = []
  let dev = false
  let open = false
  let port: number | null = null
  // `--` 之后不再解析选项，全部视为位置参数（pnpm run 透传时以 -- 分隔）
  let afterDoubleDash = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!afterDoubleDash && arg === '--') {
      afterDoubleDash = true
      continue
    }
    if (!afterDoubleDash && arg === '--dev') {
      dev = true
    } else if (!afterDoubleDash && (arg === '--open' || arg === '-o')) {
      open = true
    } else if (!afterDoubleDash && (arg === '--port' || arg === '-p')) {
      const raw = argv[++i]
      const n = Number(raw)
      if (raw === undefined || !Number.isInteger(n) || n < 1 || n > 65535) {
        return { error: `无效端口: ${raw ?? ''}` }
      }
      port = n
    } else if (!afterDoubleDash && (arg === '-h' || arg === '--help')) {
      return { error: '__HELP__' }
    } else if (!afterDoubleDash && arg.startsWith('-')) {
      return { error: `未知参数: ${arg}` }
    } else {
      positional.push(arg)
    }
  }
  // 未传位置参数时，回退到 RAGDOLL_DB 环境变量（便于 dev 脚本指定数据库）
  if (positional.length === 0 && envDb) positional.push(envDb)
  if (positional.length === 0) return { error: '缺少 SQLite 数据库路径参数' }
  if (positional.length > 1) return { error: `参数过多: ${positional.slice(1).join(' ')}` }
  return { dbPath: positional[0], dev, port, open }
}

function printUsage(): void {
  console.log(`
ragdoll-sqlite - 在浏览器中只读浏览 SQLite 数据库

用法:
  ragdoll-sqlite <sqlite 路径> [选项]

数据库路径也可通过环境变量 RAGDOLL_DB 指定（未传位置参数时生效）:
  RAGDOLL_DB=./data/app.db ragdoll-sqlite [选项]

选项:
  -o, --open      启动后自动打开浏览器（默认只打印地址）
  -p, --port N    指定端口（默认随机）
  --dev           开发模式：跳过 token 校验、固定端口 ${DEV_API_PORT}，
                  页面由 vite dev server (5173) 提供，需先运行 pnpm dev:web
  -h, --help      显示帮助
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
  const parsed = parseArgs(process.argv.slice(2), process.env.RAGDOLL_DB)
  if ('error' in parsed) {
    if (parsed.error === '__HELP__') {
      printUsage()
      return
    }
    console.error(`错误: ${parsed.error}\n`)
    printUsage()
    process.exit(1)
  }

  const { dbPath, dev, port, open } = parsed

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

  // 应用存储（自定义视图等）：打开失败不阻断服务，视图功能降级不可用
  let views = null
  try {
    views = ViewsStore.open()
  } catch (err) {
    console.warn(`警告: 应用存储打开失败，自定义视图功能不可用（${(err as Error).message}）`)
  }

  let server
  try {
    const finalPort = dev ? (port ?? DEV_API_PORT) : (port ?? 0)
    server = await startServer({ db, webDir, dev, port: finalPort, views })
  } catch (err) {
    console.error(`错误: 无法启动服务: ${(err as Error).message}`)
    db.close()
    views?.close()
    process.exit(1)
  }

  if (dev) {
    const pageUrl = `http://127.0.0.1:5173/?t=dev`
    console.log(`\nragdoll-sqlite（开发模式）已启动`)
    console.log(`  数据库: ${dbPath}`)
    console.log(`  API 服务: http://127.0.0.1:${server.port}/`)
    console.log(`  前端页面: ${pageUrl}（请先运行 pnpm dev:web）`)
    if (open) openBrowser(pageUrl)
  } else {
    console.log(`\nragdoll-sqlite 已启动`)
    console.log(`  数据库: ${dbPath}`)
    console.log(`  访问地址: ${server.url}`)
    if (open) openBrowser(server.url)
  }
  console.log(`按 Ctrl+C 退出`)

  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n正在退出…')
    void server.close().then(() => {
      db.close()
      views?.close()
      process.exit(0)
    })
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

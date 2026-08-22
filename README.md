# ragdoll-sqlite

命令行工具：`ragdoll-sqlite <sqlite 路径>` 启动一个本地只读 Web 页面，在浏览器中浏览 SQLite 数据库的表、视图、结构与数据。

![截图](docs/screenshot.png)

## 特性（v1）

- 🔒 **只读**：以 `readonly` 模式打开数据库，页面无任何写入口
- 📋 表 / 视图清单，含类型图标
- 🧱 表结构：字段（类型 / 主键 / 非空 / 默认值）、外键、索引
- 📄 分页浏览数据（默认 20 条/页，最大 500），NULL / BLOB / 中文 / emoji 安全展示
- 🛡️ 只监听 `127.0.0.1` + 随机端口 + 随机 token 校验，防止本机其他进程探测
- 🖨️ 启动后只打印访问地址，需要自动打开浏览器时加 `--open`，Ctrl+C 优雅退出

## 安装与使用

```bash
pnpm install
pnpm build

# 方式一：本地运行
node dist/cli.js ./path/to/database.db

# 方式二：全局安装后直接使用
npm i -g .
ragdoll-sqlite ./path/to/database.db
```

启动后终端会打印访问地址（默认不自动打开浏览器；需要自动打开时加 `--open`），按 `Ctrl+C` 退出。

## 开发

```bash
pnpm typecheck      # 类型检查
pnpm test           # 单元测试（Node 内置 node:test，无测试框架依赖）
pnpm build          # 构建：tsc 编译 CLI/服务端 + vite 构建前端
pnpm dev:server     # 开发模式后端（固定端口 7860，跳过 token 校验）
pnpm dev:web        # vite dev server（5173，/api 代理到 7860），前端热更新
```

开发模式：先跑 `pnpm dev:server`，再跑 `pnpm dev:web`，浏览器打开 `http://127.0.0.1:5173/?t=dev`。指定要打开的数据库有两种方式（二者等价）：

```bash
# 方式一：位置参数（通过 -- 透传给脚本）
pnpm dev:server -- ./data/app.db

# 方式二：环境变量 RAGDOLL_DB（未传位置参数时生效）
RAGDOLL_DB=./data/app.db pnpm dev:server
```

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript（strict） |
| SQLite | `better-sqlite3`（只读模式） |
| 服务端 | Node 内置 `node:http`（静态托管 + REST API，无第三方框架） |
| 前端 | React 18 + antd v5 + Vite（前后端分离 SPA，无 SSR） |
| 测试 | Node 内置 `node:test` |
| 包管理 | pnpm |

## 目录结构

```
├── package.json / pnpm-workspace.yaml
├── tsconfig.json / tsconfig.server.json / tsconfig.test.json
├── vite.config.ts / index.html
├── src/
│   ├── cli.ts              # 入口：参数解析、启动服务、打开浏览器、优雅退出
│   ├── server/
│   │   ├── http.ts         # node:http 服务器 + token 校验 + 静态托管
│   │   ├── db.ts           # better-sqlite3 只读封装（探活/元数据/分页/序列化）
│   │   └── api.ts          # REST API 处理器
│   ├── client/             # 前端 SPA（antd）
│   └── shared/types.ts     # 前后端共享类型
└── test/                   # 单元测试
```

## API

| 端点 | 说明 |
|---|---|
| `GET /api/tables` | 表/视图清单 |
| `GET /api/tables/:name` | 表结构（字段/外键/索引/行数） |
| `GET /api/tables/:name/rows?page=&pageSize=` | 分页数据 |

所有请求需携带访问令牌 `?t=<token>`（CLI 启动时生成，拼在页面 URL 中）。

## Roadmap

- 行详情抽屉、列排序、条件过滤
- 只读 SQL 查询控制台
- 导出 CSV / JSON
- 深色模式、大表虚拟滚动

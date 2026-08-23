# RagdollSqlite

命令行工具：`ragdoll-sqlite <sqlite 路径>` 启动一个本地只读 Web 页面，在浏览器中浏览 SQLite 数据库的表、视图、结构与数据。

![截图](docs/screenshot.png)

## 特性

- 🔒 **只读**：以 `readonly` 模式打开数据库，页面无任何写入口
- 📋 侧边栏「表与视图」菜单：可折叠（默认展开）、表/视图图标区分，支持后续扩展更多菜单
- 🧱 表结构：字段（类型 / 主键 / 非空 / 默认值）、外键、索引
- 📄 分页浏览数据（默认 10 条/页，最大 50），NULL / BLOB / 中文 / emoji 安全展示
- 🔍 单元格 hover 弹 Popover 看完整内容（BLOB 含 hex 预览）；点击行弹出全字段详情
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
pnpm lint           # ESLint（react-hooks 规则）
pnpm format         # Prettier 自动格式化
pnpm format:check   # 格式校验
pnpm test           # 单元 + 集成测试（Node 内置 node:test，无测试框架依赖）
pnpm build          # 构建：tsc 编译 CLI/服务端 + vite 构建前端
pnpm dev:server     # 开发模式后端（固定端口 7860，跳过 token 校验）
pnpm dev:web        # vite dev server（5173，/api 代理到 7860），前端热更新
```

开发模式：先跑 `pnpm dev:server`，再跑 `pnpm dev:web`，浏览器打开 `http://127.0.0.1:5173/?t=dev`。指定要打开的数据库：

```bash
# 方式一：位置参数直接跟在命令后面（最简）
pnpm dev:server ./data/app.db

# 方式二：环境变量 RAGDOLL_DB（未传位置参数时生效）
RAGDOLL_DB=./data/app.db pnpm dev:server
```

前端路径别名（仅前端使用，服务端保持相对导入；`vite.config.ts` 与 `tsconfig.json` 两处需保持一致）：

- `@/*` → `src/client/*`
- `@shared/*` → `src/shared/*`

## 技术栈

| 层     | 选型                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| 语言   | TypeScript（strict）                                                                                         |
| SQLite | `better-sqlite3`（只读模式）                                                                                 |
| 服务端 | Node 内置 `node:http`（静态托管 + REST API，无第三方框架）                                                   |
| 前端   | React 19 + antd v6 + Vite + react-router（HashRouter）+ CodeMirror 6（SQL 编辑器）（前后端分离 SPA，无 SSR） |
| 测试   | Node 内置 `node:test`                                                                                        |
| 包管理 | pnpm                                                                                                         |

## 目录结构

```
├── package.json / pnpm-workspace.yaml
├── tsconfig.json / tsconfig.server.json / tsconfig.test.json
├── vite.config.ts / eslint.config.js / index.html
├── src/
│   ├── cli.ts              # 入口：参数解析、启动服务、打开浏览器、优雅退出
│   ├── server/
│   │   ├── http.ts         # node:http 服务器 + token 校验 + 静态托管
│   │   ├── db.ts           # better-sqlite3 只读封装（探活/元数据/分页/序列化/行数缓存）
│   │   └── api.ts          # REST API 处理器
│   ├── client/             # 前端 SPA（React 19 + antd v6 + react-router）
│   │   ├── App.tsx          # 布局组装 + 全局加载态 + 路由表（由 NAV_ROUTES 生成）
│   │   ├── routes.tsx       # 顶层路由配置（单源：Routes 与 SiderMenu 共用）
│   │   ├── context/         # 全局 Context：SchemasContext（表清单预取）/ ViewsContext（自定义视图）
│   │   ├── api.ts           # API 层：业务函数（fetchTables / fetchTableInfo / fetchRows / refreshRowCountCache）
│   │   ├── hooks/           # 数据获取 hooks：useTableData（详情/分页/序号守卫）
│   │   ├── components/      # 全局共享组件：SiderMenu（侧边栏菜单）
│   │   └── views/           # 页面视图（文件夹 + index.tsx，第一级只有页面，目录名 = 路由路径）
│   │       ├── home/        # 主页（预留图表）
│   │       ├── query/       # 查询（SQL 控制台：CodeMirror 编辑器 + 结果预览）
│   │       └── table/       # 表数据页：?table= 参数驱动，表/视图共用
│   │           ├── index.css    # 页面专属样式（含 TableView 组件树）
│   │           └── TableView/   # 页面主体组件（私有）：index.tsx + components/ + columnUtils.ts
│   └── shared/             # 前后端共享：types.ts + constants.ts
└── test/                   # 单元 + 集成测试（db.test.ts / api.test.ts）
```

## API

| 端点                                         | 说明                                                         |
| -------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/tables`                            | 表/视图清单（表数 ≤50 时一次预取所有表头，更大库按需加载）   |
| `GET /api/overview`                          | 库总览（每表行数 + 总行数 + 库文件大小，复用行数缓存）       |
| `GET /api/tables/:name`                      | 表结构（字段/外键/索引/行数）                                |
| `GET /api/tables/:name/rows?page=&pageSize=` | 分页数据（可选 `filter` / `sortBy` / `sortDir` 参数）        |
| `POST /api/query`                            | 只读 SQL 查询（仅 SELECT/WITH/EXPLAIN/VALUES，上限 1000 行） |
| `POST /api/refresh`                          | 清空行数缓存（外部可能改过库）                               |
| `GET/POST /api/views`                        | 自定义视图：列表 / 新建（body: `{name, sql}`）               |
| `PUT/DELETE /api/views/:id`                  | 自定义视图：更新 / 删除                                      |

所有请求需携带访问令牌 `?t=<token>`（CLI 启动时生成，拼在页面 URL 中）。

自定义视图等**应用数据**存于应用自己的 `~/.ragdoll-sqlite/views.db`（与被浏览的数据库完全隔离，用户库始终保持只读）；打开失败时该功能降级不可用，不影响其他功能。

## Roadmap

- 刷新当前表、按列查询/过滤、列排序、路由化（已实现，见 [docs/ROADMAP.md](docs/ROADMAP.md)）
- 导出 CSV / JSON
- 只读 SQL 查询控制台（「查询」菜单占位页已就绪）
- 顶部历史页签栏、深色模式、大表虚拟滚动、翻页状态进 URL

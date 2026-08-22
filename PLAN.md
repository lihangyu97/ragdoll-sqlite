# ragdoll-sqlite 技术方案（v1：只读浏览）

> 一个命令行工具：`ragdoll-sqlite <sqlite 路径>` 启动本地 Web 服务并自动打开浏览器，在网页上以只读方式浏览 SQLite 数据库的表、视图、结构与数据。

---

## 1. 产品目标

**用法**

```bash
ragdoll-sqlite ./data/app.db
# → 自动打开浏览器 → http://127.0.0.1:55678/?t=xxxxx
# → 页面展示表清单、表结构、分页数据
# → Ctrl+C 退出
```

**v1 范围（只读浏览）**

- 列出数据库中的表与视图（排除 `sqlite_%` 内部表）
- 查看单表结构：字段名 / 类型 / 主键 / 非空 / 默认值 / 外键 / 索引
- 分页浏览表数据，NULL / BLOB / 大整数等特殊值安全展示
- 表行数、类型图标、字段类型徽标等易读性细节

**明确不做（v1）**：任何写操作、SQL 执行、数据导出。列入 roadmap。

---

## 2. 技术选型（含理由）

| 维度            | 选择                                                             | 理由                                                                                                          |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 语言            | TypeScript（strict）                                             | 跨端共享类型，DB 行 / API / UI 三方同源                                                                       |
| 运行时          | Node.js ≥ 20（实测 24.18 OK）                                    | better-sqlite3 的预编译二进制覆盖主流 LTS                                                                     |
| 包管理          | pnpm                                                             | 快、省磁盘；`packageManager` 字段声明，提交 `pnpm-lock.yaml`                                                  |
| SQLite 访问     | `better-sqlite3`                                                 | 同步 API 简单直接、生态成熟；`readonly` + `fileMustExist` 选项开箱即用                                        |
| Web 服务        | `node:http` + 极简手写路由                                       | 仅静态托管 + 3 个 API 端点，不引第三方运行时框架                                                              |
| 前端            | React 18 + antd v5 + Vite                                        | **前后端分离 SPA**（不做 SSR）：Vite 构建客户端，`fetch` 拉 `/api`；antd 提供现成 Table / Tabs / Descriptions |
| 前端构建        | Vite + `@vitejs/plugin-react`                                    | 开发期 HMR 热更新；生产 `vite build` 产出静态资源                                                             |
| 服务端/CLI 编译 | `tsc`（CJS）                                                     | CLI 与 server 无需打包（本地运行时 node_modules 就位），避免额外构建工具                                      |
| 测试            | Node 内置 `node:test`                                            | Node ≥ 20 可直接跑 `.ts`（type stripping），零依赖                                                            |
| 打开浏览器      | `child_process` 平台分支（`open` / `xdg-open` / `cmd /c start`） | 三行代码，不引入 npm 依赖                                                                                     |
| 分发            | `package.json` 的 `bin` 字段 → `dist/cli.js`（shebang）          | `pnpm i -g` 后即可全局使用                                                                                    |

**为什么前后端分离（不做 SSR）**：按需求简化——本地回环毫秒级延迟，首屏"加载中"可忽略；免去 SSR 的样式抽取（`@ant-design/cssinjs`）与水合复杂度；前端可独立开发、独立热更新。架构更薄，出错面更小。

---

## 3. 总体架构

```
ragdoll-sqlite <db-path>
  └─ cli.ts：解析参数 → 校验文件 → 打开只读连接 → 启动 http 服务
       │                （127.0.0.1 + 随机端口 + 随机 token）
       ├─ GET /                    → 静态 index.html（SPA 外壳）
       ├─ GET /assets/*            → Vite 构建产物（js/css）
       ├─ GET /api/tables          → 表/视图清单
       ├─ GET /api/tables/:name    → 表结构（字段/外键/索引/行数）
       ├─ GET /api/tables/:name/rows?page=&pageSize= → 分页数据
       └─ 打开浏览器（带 token 的 URL）→ 打印访问地址，Ctrl+C 优雅退出
```

**开发模式**：`vite dev` 起前端（默认 5173，配置 `/api` 代理到后端端口），后端 `RAGDOLL_DEV=1` 时页面入口指向 vite dev server，前端改动即时 HMR。

---

## 4. 数据层设计（`src/server/db.ts`）

- 以 `new Database(path, { readonly: true, fileMustExist: true })` 打开。
  - `fileMustExist` 兜住"文件不存在"；只读模式阻止写入（better-sqlite3 原生支持，无需 `PRAGMA query_only` 补丁，但可加一道保险）。
- **启动探活**：打开后立即执行一次 `SELECT name FROM sqlite_master LIMIT 1`。
  > ⚠️ 非 SQLite 文件在只读模式下打开**不会立即抛错**，错误延迟到首次查询才出现。必须主动探活，才能给出「不是有效的 SQLite 文件」这类友好提示。
- **只读双保险**：`readonly` 模式 + 不提供任何写 API；页面无任何写入口。
- **防注入**：所有值一律 `prepare` 参数化；表名走白名单——仅接受 `sqlite_master` 中真实存在的表/视图名，杜绝路径穿越与名称注入。
- **元数据来源**：`sqlite_master`、`PRAGMA table_info`、`PRAGMA foreign_key_list`、`PRAGMA index_list`（或 `db.pragma(...)` 便捷方法）。
- **行数策略**：`SELECT count(*)` 对大表较慢 → 表清单先返回不含行数，行数通过结构接口**惰性加载**（UI 异步刷新角标）。
- **值序列化**（统一层，保证 JSON 安全）：
  - `NULL → null`；数字 / 字符串原样
  - `BLOB → { __blob: true, bytes, hex 前若干字节 }`（UI 显示 `BLOB(3 bytes)`；better-sqlite3 返回 `Buffer`）
  - 大整数：v1 默认 number 展示（超出安全范围标注精度损失），后续需要精确可开 `safeIntegers`
- **分页**：`LIMIT/OFFSET` + 总数；`pageSize` 默认 50、上限 500。

---

## 5. API 设计（全部返回 JSON）

| 端点                                            | 说明        | 返回                                                                                       |
| ----------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| `GET /api/tables`                               | 表/视图清单 | `[{ name, type: 'table'\|'view' }]`                                                        |
| `GET /api/tables/:name`                         | 表结构      | `{ columns: [{ name, type, notNull, pk, defaultValue }], foreignKeys, indexes, rowCount }` |
| `GET /api/tables/:name/rows?page=1&pageSize=50` | 分页数据    | `{ total, page, pageSize, rows: Array<Record<string, any>> }`                              |

错误统一 `{ error: string }`，区分 400 / 404 / 500。

---

## 6. 前端 UI（antd SPA，`src/client/App.tsx`）

- **Layout**：左侧 `Sider`（表/视图列表：类型图标 + 名称 + 行数角标），右侧 `Content`。
- **主区 `Tabs`**：
  - 「数据」：antd `Table`——行号列、字段类型 `Tag` 徽标、列头 Tooltip 显示完整 schema、NULL 灰显、BLOB 特殊渲染、底部 `Pagination`。
  - 「结构」：`Descriptions`（字段详情）+ 外键 / 索引小表格。
- **数据获取**：进入页面即 `fetch /api/tables`；切换表 → `fetch` 结构 + 分页数据；统一 `Spin` / `Skeleton` 加载态、错误 `Alert`。
- **状态**：空库提示、表不存在、接口错误提示。

---

## 7. 安全设计（本地工具也不可省）

1. 只绑定 `127.0.0.1`，不监听公网。
2. 随机端口 + 启动时生成随机 token 拼进 URL（`?t=xxx`），服务端对页面与 API 请求校验——防止本机其他进程 / 恶意网页扫端口探测数据。
3. 只读模式双保险，且**绝不执行来自客户端的 SQL**。
4. API 仅能访问 sqlite_master 白名单内的表名，页面无法访问任意文件路径。

---

## 7.5 依赖清单（pnpm 管理）

**运行时依赖（dependencies）——共 5 个**

| 包                    | 用途                                                     |
| --------------------- | -------------------------------------------------------- |
| `react` / `react-dom` | 前端 SPA（React 18，antd v5 原生支持，无需补丁）         |
| `antd`                | UI 组件库（Layout / Table / Tabs / Descriptions / Tree） |
| `@ant-design/icons`   | 表/视图类型图标、UI 图标                                 |
| `better-sqlite3`      | SQLite 访问（原生模块，预编译二进制）                    |

**开发依赖（devDependencies）——共 6 个**

| 包                                  | 用途                                       |
| ----------------------------------- | ------------------------------------------ |
| `typescript`                        | 类型检查（strict）+ 编译 CLI/server（CJS） |
| `vite`                              | 前端 SPA 构建 + 开发 HMR                   |
| `@vitejs/plugin-react`              | React 快速刷新                             |
| `@types/node`                       | Node 内置 API 类型                         |
| `@types/react` / `@types/react-dom` | React 类型                                 |

**明确不引入**：Web 框架（用内置 `node:http`）、SSR 样式库（`@ant-design/cssinjs`——无 SSR 不再需要）、浏览器打开库（用 `child_process` 平台分支）、测试框架（用 Node 内置 `node:test`）、React 19 补丁（用 React 18）。

---

## 8. 目录结构

```
ragdoll-sqlite/
├── package.json            # bin: ragdoll-sqlite → dist/cli.js；packageManager: pnpm
├── tsconfig.json           # 类型检查（全量）
├── tsconfig.server.json    # 编译 src/cli + src/server → dist/（CJS，供 node 直跑）
├── vite.config.ts          # SPA 构建；dev 模式 /api 代理到后端
├── index.html              # SPA 入口 HTML
├── src/
│   ├── cli.ts              # 入口：参数解析、文件校验、启动服务、打开浏览器、优雅退出
│   ├── server/
│   │   ├── http.ts         # node:http：静态资源托管 + 路由分发 + token 校验
│   │   ├── db.ts           # better-sqlite3 只读连接、探活、元数据、分页查询、值序列化
│   │   └── api.ts          # /api 处理器（JSON）
│   ├── client/
│   │   ├── main.tsx        # createRoot 挂载（无 SSR/hydrate）
│   │   └── App.tsx         # antd 界面（Sider + Tabs + Table + fetch 数据流）
│   └── shared/
│       └── types.ts        # TableInfo / ColumnInfo / RowsResult 等共享类型
└── README.md               # 安装、用法、开发指南
```

---

## 9. 开发里程碑

| 里程碑    | 内容                                                                                                              | 验收                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| M1 脚手架 | pnpm init、双 tsconfig、vite.config、package.json（bin/scripts）；`pnpm build` 产出 `dist/cli.js` 与 `dist/web/*` | 构建命令可跑通                              |
| M2 数据层 | db.ts：只读打开 + 探活 + 表清单 + 结构 + 分页 + 序列化（含 `node:test` 单测，用临时 sqlite 文件）                 | 对测试库能取回正确元数据与分页行            |
| M3 服务层 | http.ts + api.ts：静态托管 + 三端点 + token 校验                                                                  | curl 各端点返回正确 JSON，无 token 返回 403 |
| M4 前端   | Vite + antd SPA：表清单 Sider + 数据/结构 Tabs + 分页 Table；dev 模式 HMR                                         | 浏览器打开即见表清单，分页/切表流畅         |
| M5 收尾   | 自动开浏览器（跨平台）、Ctrl+C 优雅退出、错误提示、README                                                         | `node dist/cli.js 某.db` 一键体验完整流程   |

---

## 10. 风险与对策

| 风险                                                        | 对策                                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 大表 `count(*)` 慢                                          | 行数惰性加载；分页查询本身带 LIMIT                                                                                     |
| BLOB / 大整数等值 JSON 不安全                               | 统一序列化层（见 §4）                                                                                                  |
| 非 SQLite / 损坏文件打开不报错                              | 启动探活 + 友好报错（该坑对 better-sqlite3 同样成立）                                                                  |
| better-sqlite3 原生模块：目标平台无预编译二进制时需本机编译 | 发布前在主流平台（macOS/Linux/Windows + 当前 LTS Node）验证预编译产物；db.ts 单文件隔离，必要时可换 `node:sqlite` 降级 |
| 打开浏览器命令平台差异                                      | 平台分支封装在 `openBrowser()`                                                                                         |

---

## 11. 后续版本（roadmap）

1. 行详情抽屉、列排序、按条件简单过滤
2. 只读 SQL 查询控制台（仅 SELECT，仍只读）
3. 导出 CSV / JSON
4. 深色模式、页面偏好持久化（localStorage）
5. 大表虚拟滚动（antd `virtual`）

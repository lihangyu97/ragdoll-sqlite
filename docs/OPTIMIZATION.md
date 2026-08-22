# ragdoll-sqlite 优化方案（体检报告）

> 状态：**第一批（1-8）已完成**；列排序/条件过滤/路由/分层重构/别名等后续规划也已实现。
> 待做：9 CI、10 发布优化、虚拟滚动等体验项。
>
> 现状基线：前端 bundle 341KB（gzip），服务端测试 30 例（db + API 集成）。

---

## P1 性能

### 1. `count(*)` 全表扫描 ✅ 已解决（行数缓存）

- 现状：`SqliteDb.rowCountCache` 按表缓存行数，只读库下重复 `count(*)` 只在首次发生；
  过滤/排序态不走缓存（各自独立 count）。刷新时 `POST /api/refresh` 清空缓存。
- 残余：大表首次 count 仍耗时（本地工具可接受）。

### 2. 大页尺寸时每单元格一个 Popover 实例 🟡 看使用场景

- 现状：每个数据单元格都渲染一个 `Popover`（`rc-trigger` 实例）。
  pageSize=50、15 列时 = 750 个实例，渲染/内存开销尚可；默认 10 条/页完全无压力。
- 方案（按需）：antd Table `virtual` 虚拟滚动；或降低 pageSize 上限。
- 收益：大页场景帧率与内存。成本：virtual 需微调列宽/行高，中等。

### 3. `listSchemas()` 超多表启动慢 ✅ 已解决（大库惰性）

- 现状：表数超过 `SCHEMA_PREFETCH_THRESHOLD`（50）时 `/api/tables` 不预取字段，
  选中表时通过详情接口按需加载；客户端用详情接口 columns 兜底。

---

## P2 代码结构与质量 ✅ 全部完成

### 4. 补 API/HTTP 集成测试 ✅

- `test/api.test.ts`：真实服务器 + fetch 断言 token 门禁、错误码、分页/过滤/排序、
  特殊字符表名、路径穿越等。

### 5. 抽 `useTableData` hook ✅

- 已抽取并迁移到 `src/client/hooks/useTableData.ts`；选中表由路由 URL 派生，
  序号守卫防过期响应；切表跳过旧条件请求。

### 6. ESLint + Prettier 落地 ✅

- `eslint.config.js`（ESLint 官方 `defineConfig`，react-hooks 规则）+ `format`/`format:check` 脚本。

### 7. 端口常量去重 ✅

- `DEV_API_PORT` 在 `src/shared/constants.ts`，cli 与 vite 代理共用。

### 8. 切表加载失败时旧数据残留 ✅ 已修

- rows 请求失败时清空 `rows`（`setRows(null)`），避免"新表头 + 旧数据"。

---

## P3 工程化（可选）

### 9. GitHub Actions CI

- typecheck + test + build + format:check，main 分支与 PR 上跑。
- 收益：质量门禁。成本：一个 workflow 文件。

### 10. 发布相关

- `prepublishOnly` 脚本（发布前自动 `pnpm build`）；
- antd 拆独立 chunk（`manualChunks`）：纯缓存优化，本地工具毫秒级加载，收益有限，可选。

---

## 体验/功能（已实现）

- 列排序 / 条件过滤 ✅
- 路由化（react-router HashRouter）+ URL 直达 `#/table?table=<name>` ✅
- 前端分层：api 业务层 / hooks / views（页面 + 私有组件）+ 路径别名 `@/`、`@shared/` ✅
- 表名含特殊字符（`/`、`&`、`#`）可正常访问 ✅

## 体验/功能（未排期）

- 完整深色模式（当前是深色侧边栏 + 浅色内容区）
- 只读 SQL 查询控制台（「查询」菜单占位页已就绪）
- 导出 CSV / JSON
- 顶部历史页签栏（基于现有路由，每表一个 URL，天然支持）
- 大表虚拟滚动 / 翻页状态进 URL

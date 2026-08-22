# ragdoll-sqlite 优化方案（体检报告）

> 状态：**第一批（1-8）已全部完成** ｜ 待做：9 CI、10 发布优化、P4 功能项
>
> 现状基线：TS 1244 行；前端 bundle 959KB（gzip 303KB）；测试仅覆盖 db.ts；
> 已有 prettier 配置但无 eslint/CI；无 GitHub Actions。

---

## P1 性能（真实存在的热点，建议优先做）

### 1. `count(*)` 在切表/翻页时全表扫描 🔴 最值得做

- 位置：`db.ts:167`（`tableInfo().rowCount`）+ `db.ts:182`（`rows().total`）
- 现状：**每次切表**跑一次 `count(*)`（详情接口），**每次翻页**再跑一次（分页 total）。
  对百万行大表，单次 `count(*)` 需要 1 秒左右，切表/翻页都会明显卡顿。
- 方案（只读库下很简单）：
  - 服务端**按表缓存行数**（`Map<table, number>`，首次计算后复用）——DB 以只读打开，数据不会自己变；
  - 或给 `GET /api/tables/:name` 加 `?skipCount=1`，行数只由分页响应里的 `total` 提供（表头本来就用它）。
- 收益：大表操作从秒级 → 毫秒级。成本：约 10 行代码。

### 2. 大页尺寸时每单元格一个 Popover 实例 🟡 看使用场景

- 现状：每个数据单元格都渲染一个 `Popover`（`rc-trigger` 实例）。
  pageSize=500、15 列时 = 7500 个实例，渲染/内存开销明显。
- 方案：
  - antd Table `virtual` 虚拟滚动（仅渲染可视行，大页才有收益）；
  - 或把 pageSize 上限从 500 降到 200；
  - 或保持现状（默认 20 条/页完全无压力）。
- 收益：大页场景帧率与内存。成本：virtual 需微调列宽/行高，中等。

### 3. `listSchemas()` 对超多表的库启动变慢 🟡 看库规模

- 现状：`/api/tables` 逐表执行 `pragma_table_info`（一次请求内串行）。
  几十表无感；几百上千表时启动明显变慢。
- 方案：表数超过阈值（如 50）时降级——先返回不含 columns 的清单，选中表时再单独拉字段。
  代价：牺牲"切表秒见表头"（之前特意做的）。
- 收益：超大库启动快。成本：客户端要处理"columns 缺失→按需加载"分支。

---

## P2 代码结构与质量（成本低、收益高）

### 4. 补 API/HTTP 集成测试 🟢 建议做

- 现状：只有 `test/db.test.ts`（数据层）；`api.ts`、`http.ts`（token 校验、404/400/403、静态服务）零覆盖。
- 方案：`node:test` 起真实服务器（随机端口）+ `fetch` 断言各端点、错误码、token 门禁、路径穿越。
- 收益：重构/加功能不怕回归。成本：约 60-80 行测试。

### 5. 抽 `useTableData` hook 🟢 建议做

- 现状：`App.tsx` 里三个 effect + 序号守卫（infoSeq/rowsSeq）重复模式，约 40 行逻辑。
- 方案：抽成 `useTableData(selected, page, pageSize)` 返回 `{ info, rows, loadingRows, dataError, error }`。
- 收益：App.tsx 变薄、逻辑复用/可测。成本：低。

### 6. ESLint + Prettier 落地 🟢 顺手做

- 现状：prettier 已安装且有 `.prettierrc`，但**没有 format 脚本**、没有 eslint、CI 不校验格式
  （现在提交的代码格式来自手工格式化，风格偶有不一致）。
- 方案：加 `format`/`format:check` 脚本 + `eslint`（typescript + react hooks 规则）+ 提交前 `format:check`。
- 收益：格式统一、少踩 hooks 规则的坑。成本：低。

### 7. 端口常量去重 🟢 顺手做

- 现状：`7860` 硬编码在 `src/cli.ts:9` 与 `vite.config.ts:5` 两处，改一处忘另一处就会 dev 代理失效。
- 方案：抽到共享常量（或通过环境变量读取，cli 优先、vite 回退）。
- 成本：几行。

### 8. BUG 候选：切表加载失败时旧数据残留 🟢 建议修

- 现状：切表时保留旧行做 loading 遮罩（防闪烁）；但**新表加载失败**时旧行不会清掉，
  会出现"新表头 + 旧表数据"的错误展示（顶部虽有错误提示）。
- 方案：rows 请求失败时清空 rows（`setRows(null)`）。
- 成本：1 行。

---

## P3 工程化（可选）

### 9. GitHub Actions CI

- typecheck + test + build + format:check，main 分支与 PR 上跑。
- 收益：质量门禁。成本：一个 workflow 文件。

### 10. 发布相关

- `prepublishOnly` 脚本（发布前自动 `pnpm build`）；
- antd 拆独立 chunk（`manualChunks`）：纯缓存优化，本地工具 303KB gzip 从 localhost 加载毫秒级，收益有限，可选。

---

## P4 体验/功能（roadmap 已有，未排期）

- 完整深色模式（当前是深色侧边栏 + 浅色内容区）
- 列排序 / 条件过滤
- 只读 SQL 查询控制台（你之前提过要加菜单）
- 导出 CSV / JSON

---

## 建议的执行顺序

| 批次               | 内容                                                                  | 理由                     |
| ------------------ | --------------------------------------------------------------------- | ------------------------ |
| 第一批（本周可做） | 1 行数缓存 + 8 失败清空 + 5 useTableData + 7 端口去重 + 6 lint/format | 纯收益、低成本、无风险   |
| 第二批             | 4 集成测试 + 9 CI                                                     | 补上质量门禁，防后续回归 |
| 第三批（按需）     | 2 虚拟滚动 / 3 大库惰性 schema                                        | 取决于你实际使用的库规模 |
| 远期               | P4 功能项                                                             | roadmap                  |

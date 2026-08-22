import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { Empty, Layout, Result, Spin } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import type { TableSchemaEntry } from '../shared/types.js'
import { apiFetch } from './api.js'
import TableList, { type ViewKey } from './components/TableList.js'
import { useTableData } from './useTableData.js'
import HomeView from './views/HomeView.js'
import QueryView from './views/QueryView.js'
import TableView from './views/TableView.js'

const { Sider, Content } = Layout

/**
 * 应用容器：表清单预取 + 顶层视图切换（主页 / 表数据浏览 / 查询）+ 布局组装。
 * 视图切换用 state 而非 React Router：本工具端口与 token 每次启动都变，
 * URL 跨会话不可复用，路由收益极低；后续需要 URL 同步时再补 read/pushState。
 */
export default function App() {
  const [schemas, setSchemas] = useState<TableSchemaEntry[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [view, setView] = useState<ViewKey>('tables')
  const {
    selected,
    select,
    info,
    rows,
    loadingRows,
    dataError,
    clearError,
    onPageChange,
    filters,
    setFilters,
    sort,
    setSort,
    refresh
  } = useTableData()

  // 初始加载：表/视图清单 + 字段预取（一次请求），并自动选中第一个
  useEffect(() => {
    apiFetch<TableSchemaEntry[]>('/api/tables')
      .then(list => {
        // 防御：旧版服务端进程不返回 columns，导致页面白屏，给明确提示
        if (!list.every(s => Array.isArray(s.columns))) {
          setTablesError(
            '服务端响应缺少表字段信息。可能是旧的服务进程仍在运行，请先停止旧的 ragdoll-sqlite 再重新启动。'
          )
          return
        }
        setSchemas(list)
        if (list.length > 0) select(list[0].name)
      })
      .catch(err => setTablesError((err as Error).message))
  }, [select])

  const handleNavigate = useCallback((next: 'home' | 'query') => setView(next), [])
  const handleSelectTable = useCallback(
    (name: string) => {
      select(name)
      setView('tables')
    },
    [select]
  )

  // ---- 全局状态：加载失败 / 首次加载中 ----
  if (tablesError) {
    return <Result status="error" title="加载失败" subTitle={tablesError} />
  }
  if (schemas === null) {
    return (
      <div className="loading-wrap">
        <Spin size="large" />
      </div>
    )
  }

  const selectedSchema = schemas.find(s => s.name === selected) ?? null
  // 超大库（>50 表）时 schema 不带字段 → 用详情接口的 columns 兜底
  const tableColumns =
    selectedSchema && selectedSchema.columns.length > 0
      ? selectedSchema.columns
      : (info?.columns ?? [])

  return (
    <Layout className="app-layout">
      <Sider
        width={240}
        collapsedWidth={80}
        theme="light"
        collapsible
        collapsed={collapsed}
        trigger={null}
        className="app-sider"
      >
        <div className="sider-logo">
          <img src="/favicon.svg" alt="RagdollSqlite" className="sider-logo-icon" />
          {!collapsed && <span className="sider-logo-title">RagdollSqlite</span>}
        </div>
        <TableList
          tables={schemas}
          selected={selected}
          view={view}
          onSelectTable={handleSelectTable}
          onNavigate={handleNavigate}
        />
        <div
          className="sider-trigger"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          {!collapsed && <span>收起</span>}
        </div>
      </Sider>

      <Content className="app-content">
        {view === 'home' ? (
          <HomeView />
        ) : view === 'query' ? (
          <QueryView />
        ) : selectedSchema === null ? (
          <Empty description="数据库中没有表或视图" style={{ marginTop: 80 }} />
        ) : (
          <TableView
            schema={selectedSchema}
            columns={tableColumns}
            info={info}
            rows={rows}
            loadingRows={loadingRows}
            dataError={dataError}
            clearError={clearError}
            onPageChange={onPageChange}
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            onRefresh={refresh}
          />
        )}
      </Content>
    </Layout>
  )
}

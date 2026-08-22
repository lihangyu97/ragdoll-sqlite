import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { Layout, Result, Spin } from 'antd'
import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import type { TableSchemaEntry } from '@shared/types'
import { fetchTables } from '@/api'
import SiderMenu from '@/components/SiderMenu'
import HomePage from '@/views/home'
import QueryPage from '@/views/query'
import TablePage from '@/views/table'

const { Sider, Content } = Layout

/**
 * 应用容器：表清单预取 + 布局组装。
 * 视图切换由 react-router（HashRouter）驱动：
 * `/` → `/home`（主页）｜ `/table`（表数据页，`?table=` 指定表）｜ `/query` 查询。
 * 访问令牌在 hash 外的 `?t=` 中，路由切换不触碰它；hash 路由无需服务端 SPA fallback。
 */
export default function App() {
  const [schemas, setSchemas] = useState<TableSchemaEntry[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // 初始加载：表/视图清单 + 字段预取（一次请求）
  useEffect(() => {
    fetchTables()
      .then(list => {
        // 防御：旧版服务端进程不返回 columns，导致页面白屏，给明确提示
        if (!list.every(s => Array.isArray(s.columns))) {
          setTablesError(
            '服务端响应缺少表字段信息。可能是旧的服务进程仍在运行，请先停止旧的 ragdoll-sqlite 再重新启动。'
          )
          return
        }
        setSchemas(list)
      })
      .catch(err => setTablesError((err as Error).message))
  }, [])

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
        <SiderMenu tables={schemas} />
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
        <Routes>
          {/* 默认进入主页；表名走 ?table= 查询参数，规避路径编码问题 */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/table" element={<TablePage schemas={schemas} />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="*" element={<Navigate to="/table" replace />} />
        </Routes>
      </Content>
    </Layout>
  )
}

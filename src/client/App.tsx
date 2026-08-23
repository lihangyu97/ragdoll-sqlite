import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { Layout, Result, Spin } from 'antd'
import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import SiderMenu from '@/components/SiderMenu'
import { NAV_ROUTES } from '@/routes'
import { useSchemas } from '@/context/SchemasContext'

const { Sider, Content } = Layout

/**
 * 应用容器：布局组装 + 全局加载态（表清单由 SchemasProvider 预取）。
 * 路由全部由 NAV_ROUTES 生成（新增页面只需在 routes.tsx 追加一项）；
 * 仅保留两条应用级重定向：/ → /home（默认页）、* → /table（兜底）。
 * 访问令牌在 hash 外的 `?t=` 中，路由切换不触碰它；hash 路由无需服务端 SPA fallback。
 */
export default function App() {
  const { schemas, error } = useSchemas()
  const [collapsed, setCollapsed] = useState(false)

  // ---- 全局状态：加载失败 / 首次加载中 ----
  if (error) {
    return <Result status="error" title="加载失败" subTitle={error} />
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
          {/* 默认进入主页 */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          {/* 全部页面路由由 NAV_ROUTES 生成（route: false 的仅菜单项不生成路由） */}
          {NAV_ROUTES.filter(r => r.route !== false).map(r => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
          {/* 未知路径兜底到表数据页 */}
          <Route path="*" element={<Navigate to="/table" replace />} />
        </Routes>
      </Content>
    </Layout>
  )
}

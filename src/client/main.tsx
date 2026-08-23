import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { HashRouter } from 'react-router'
import App from '@/App'
import { SchemasProvider } from '@/context/SchemasContext'
import { ViewsProvider } from '@/context/ViewsContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* antd v6 移除了 Tag 末尾默认间距，这里全局恢复（等价 v5 行为） */}
    <ConfigProvider
      tag={{
        styles: {
          root: { marginInlineEnd: 8 }
        }
      }}
    >
      {/* HashRouter：token 留在 hash 外的 ?t= 中，路由切换不触碰它；
          且生产环境 node:http 静态托管无需 SPA fallback */}
      <HashRouter>
        {/* 表清单全局预取（App 与页面共享） */}
        <SchemasProvider>
          {/* 自定义视图全局状态（侧边栏菜单与查询页共享） */}
          <ViewsProvider>
            <App />
          </ViewsProvider>
        </SchemasProvider>
      </HashRouter>
    </ConfigProvider>
  </React.StrictMode>
)

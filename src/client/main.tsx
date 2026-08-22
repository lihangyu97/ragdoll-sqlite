import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App.js'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* antd v6 移除了 Tag 末尾默认间距，这里全局恢复（等价 v5 行为） */}
    <ConfigProvider
      tag={{
        styles: {
          root: { marginInlineEnd: 8 },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)

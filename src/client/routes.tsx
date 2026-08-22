import { DatabaseOutlined, HomeOutlined, SearchOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import HomePage from '@/views/home'
import QueryPage from '@/views/query'
import TablePage from '@/views/table'

export interface NavRoute {
  /** 路由 path，同时作为侧边栏菜单 key（非菜单路由无需此约束） */
  path: string
  label: string
  icon: ReactNode
  element: ReactNode
  /** 是否出现在侧边栏导航区；表数据页由「表与视图」子菜单承载，置 false */
  menu?: boolean
}

/**
 * 顶层路由配置（单源）：App 的 <Routes> 全部由它生成，SiderMenu 的导航 items 由
 * menu !== false 的项生成。新增页面只需在这里追加一项。
 * 重定向规则（/ → /home、* → /table）属应用级行为，留在 App 内联。
 */
export const NAV_ROUTES: NavRoute[] = [
  { path: '/home', label: '主页', icon: <HomeOutlined />, element: <HomePage /> },
  { path: '/query', label: '查询', icon: <SearchOutlined />, element: <QueryPage /> },
  {
    path: '/table',
    label: '表与视图',
    icon: <DatabaseOutlined />,
    element: <TablePage />,
    menu: false
  }
]

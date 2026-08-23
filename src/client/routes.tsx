import {
  BookOutlined,
  DatabaseOutlined,
  EyeOutlined,
  HomeOutlined,
  SearchOutlined,
  TableOutlined
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import type { ReactNode } from 'react'
import type { CustomView, TableEntry } from '@shared/types'
import HomePage from '@/views/home'
import QueryPage from '@/views/query'
import TablePage from '@/views/table'

/** 菜单渲染上下文：SiderMenu 渲染时注入的运行时数据（接口返回后可用） */
export interface MenuContext {
  tables: TableEntry[]
  views: CustomView[]
}

/** antd Menu 的单个 items 元素 */
export type MenuItem = NonNullable<MenuProps['items']>[number]

/** 表项 key 前缀：防止表名与导航项（路径）key 冲突（渲染与点击分发共用） */
export const TABLE_KEY_PREFIX = 'table:'
/** 自定义视图项 key 前缀 */
export const VIEW_KEY_PREFIX = 'view:'

export interface NavRoute {
  /** 路由 path */
  path: string
  label: string
  icon: ReactNode
  element: ReactNode
  /**
   * 自定义菜单渲染（缺省为普通导航项：key=path + icon + label）。
   * 动态菜单（表与视图、自定义视图等）由自己持有渲染逻辑；返回 null 则不显示。
   */
  menuRender?: (ctx: MenuContext) => MenuItem | null
  /** 是否生成路由；false 表示仅作菜单项（如自定义视图，点击跳转到查询页） */
  route?: boolean
}

/** 「表与视图」子菜单：children 由接口返回的表清单动态生成 */
function renderTablesSubmenu({ tables }: MenuContext): MenuItem {
  return {
    key: 'tables',
    icon: <DatabaseOutlined />,
    label: '表与视图',
    children:
      tables.length === 0
        ? [{ key: 'empty', disabled: true, label: '暂无' }]
        : tables.map(t => ({
            key: `${TABLE_KEY_PREFIX}${t.name}`,
            icon: t.type === 'view' ? <EyeOutlined /> : <TableOutlined />,
            label: (
              <span className="menu-item-label">
                <span className="menu-item-name">{t.name}</span>
              </span>
            )
          }))
  }
}

/** 「自定义视图」子菜单：children 为用户保存的视图（点击跳查询页执行对应 SQL） */
function renderCustomViewsSubmenu({ views }: MenuContext): MenuItem {
  return {
    key: 'custom-views',
    icon: <BookOutlined />,
    label: '自定义视图',
    children:
      views.length === 0
        ? [{ key: 'empty-views', disabled: true, label: '暂无' }]
        : views.map(v => ({
            key: `${VIEW_KEY_PREFIX}${v.id}`,
            label: (
              <span className="menu-item-label">
                <span className="menu-item-name">{v.name}</span>
              </span>
            )
          }))
  }
}

/**
 * 顶层路由配置（单源）：App 的 <Routes> 由 route !== false 的项生成；SiderMenu 的 items
 * 按数组顺序生成——**数组顺序即侧边栏菜单顺序**，调整顺序即可重新排序菜单。
 * 需要自定义菜单的项提供 menuRender（自己持有渲染逻辑）。
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
    menuRender: renderTablesSubmenu
  },
  {
    // 与「表与视图」共用 /table 路由，?viewId= 参数区分（点击跳转 /table?viewId=N）
    path: '/table',
    label: '自定义视图',
    icon: <BookOutlined />,
    element: <TablePage />,
    menuRender: renderCustomViewsSubmenu,
    route: false
  }
]

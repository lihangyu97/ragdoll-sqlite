import {
  DatabaseOutlined,
  EyeOutlined,
  HomeOutlined,
  SearchOutlined,
  TableOutlined
} from '@ant-design/icons'
import { Tag } from 'antd'
import type { MenuProps } from 'antd'
import type { ReactNode } from 'react'
import type { TableEntry } from '@shared/types'
import HomePage from '@/views/home'
import QueryPage from '@/views/query'
import TablePage from '@/views/table'

/** 菜单渲染上下文：SiderMenu 渲染时注入的运行时数据（接口返回后可用） */
export interface MenuContext {
  tables: TableEntry[]
}

/** antd Menu 的单个 items 元素 */
export type MenuItem = NonNullable<MenuProps['items']>[number]

/** 表项 key 前缀：防止表名与导航项（路径）key 冲突（渲染与点击分发共用） */
export const TABLE_KEY_PREFIX = 'table:'

export interface NavRoute {
  /** 路由 path */
  path: string
  label: string
  icon: ReactNode
  element: ReactNode
  /**
   * 自定义菜单渲染（缺省为普通导航项：key=path + icon + label）。
   * 动态菜单（表与视图、未来的查询历史等）由自己持有渲染逻辑；返回 null 则不显示。
   */
  menuRender?: (ctx: MenuContext) => MenuItem | null
}

/** 「表与视图」子菜单：children 由接口返回的表清单动态生成 */
function renderTablesSubmenu({ tables }: MenuContext): MenuItem {
  return {
    key: 'tables',
    icon: <DatabaseOutlined />,
    label: '表与视图',
    children:
      tables.length === 0
        ? [{ key: 'empty', disabled: true, label: '数据库中没有表或视图' }]
        : tables.map(t => ({
            key: `${TABLE_KEY_PREFIX}${t.name}`,
            icon: t.type === 'view' ? <EyeOutlined /> : <TableOutlined />,
            label: (
              <span className="menu-item-label">
                <span className="menu-item-name">{t.name}</span>
                {t.type === 'view' && (
                  <Tag color="cyan" className="menu-item-tag">
                    视图
                  </Tag>
                )}
              </span>
            )
          }))
  }
}

/**
 * 顶层路由配置（单源）：App 的 <Routes> 全部由它生成；SiderMenu 的 items 也按
 * 数组顺序生成——**数组顺序即侧边栏菜单顺序**，调整顺序即可重新排序菜单。
 * 需要自定义菜单的项提供 menuRender（自己持有渲染逻辑，如「表与视图」子菜单）。
 * 重定向规则（/ → /home、* → /table）属应用级行为，留在 App 内联。
 */
export const NAV_ROUTES: NavRoute[] = [
  { path: '/home', label: '主页', icon: <HomeOutlined />, element: <HomePage /> },
  {
    path: '/table',
    label: '表与视图',
    icon: <DatabaseOutlined />,
    element: <TablePage />,
    menuRender: renderTablesSubmenu
  },
  { path: '/query', label: '查询', icon: <SearchOutlined />, element: <QueryPage /> }
]

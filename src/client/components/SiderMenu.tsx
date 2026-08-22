import { Menu } from 'antd'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { TableEntry } from '@shared/types'
import { NAV_ROUTES, TABLE_KEY_PREFIX } from '@/routes'

interface SiderMenuProps {
  tables: TableEntry[]
}

/**
 * 侧边栏菜单：通用渲染器。items 完全由 NAV_ROUTES 按数组顺序生成（顺序即菜单顺序）；
 * 普通项渲染为 导航项（key=path），自定义菜单项调用各自的 menuRender（渲染逻辑由配置自持有）。
 * 选中态与导航均由 react-router 派生：pathname → 菜单 key，`?table=` → 当前表。
 */
export default function SiderMenu({ tables }: SiderMenuProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const isTablePage = location.pathname === '/table'
  const selectedTable = isTablePage ? searchParams.get('table') : null
  const selectedKeys =
    isTablePage && selectedTable !== null
      ? [`${TABLE_KEY_PREFIX}${selectedTable}`]
      : isTablePage
        ? ['tables']
        : [location.pathname]

  return (
    <Menu
      theme="light"
      mode="inline"
      selectedKeys={selectedKeys}
      onClick={({ key }) => {
        if (key.startsWith(TABLE_KEY_PREFIX)) {
          // 表名走查询参数（encodeURIComponent 防表名含 & / # 等特殊字符）
          navigate(`/table?table=${encodeURIComponent(key.slice(TABLE_KEY_PREFIX.length))}`)
        } else if (key !== 'tables') {
          // 导航项 key 即路由 path
          navigate(key)
        }
      }}
      items={NAV_ROUTES.map(r =>
        r.menuRender ? r.menuRender({ tables }) : { key: r.path, icon: r.icon, label: r.label }
      )}
    />
  )
}

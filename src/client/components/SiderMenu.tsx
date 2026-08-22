import { DatabaseOutlined, EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Menu, Tag } from 'antd'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { TableEntry } from '@shared/types'
import { NAV_ROUTES } from '@/routes'

/** 表项 key 前缀：防止表名与导航项（路径）key 冲突 */
const TABLE_KEY_PREFIX = 'table:'

interface SiderMenuProps {
  tables: TableEntry[]
}

/**
 * 侧边栏菜单：导航项由 NAV_ROUTES 生成（key 即路由 path），表/视图子菜单单独渲染。
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
      defaultOpenKeys={['tables']}
      onClick={({ key }) => {
        if (key.startsWith(TABLE_KEY_PREFIX)) {
          // 表名走查询参数（encodeURIComponent 防表名含 & / # 等特殊字符）
          navigate(`/table?table=${encodeURIComponent(key.slice(TABLE_KEY_PREFIX.length))}`)
        } else if (key !== 'tables') {
          // 导航项 key 即路由 path
          navigate(key)
        }
      }}
      items={[
        ...NAV_ROUTES.filter(r => r.menu !== false).map(r => ({
          key: r.path,
          icon: r.icon,
          label: r.label
        })),
        {
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
      ]}
    />
  )
}

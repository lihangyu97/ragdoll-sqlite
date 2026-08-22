import {
  DatabaseOutlined,
  EyeOutlined,
  HomeOutlined,
  SearchOutlined,
  TableOutlined
} from '@ant-design/icons'
import { Menu, Tag } from 'antd'
import type { TableEntry } from '../../shared/types.js'

/** 顶层视图：tables=表数据浏览，home=主页（图表），query=查询（SQL 编辑器） */
export type ViewKey = 'tables' | 'home' | 'query'

/** 顶层菜单项（非表）的 key 集合，用于区分「导航项」与「表项」 */
const NAV_KEYS: ReadonlySet<string> = new Set(['home', 'query'])
/** 表项 key 前缀：防止表名恰好叫 home/query 时与导航项 key 冲突 */
const TABLE_KEY_PREFIX = 'table:'

interface TableListProps {
  tables: TableEntry[]
  selected: string | null
  view: ViewKey
  onSelectTable: (name: string) => void
  onNavigate: (view: 'home' | 'query') => void
}

/**
 * 侧边栏菜单：主页 / 表与视图（可折叠子菜单，默认展开）/ 查询。
 * 表项 key 带前缀避免与导航项冲突；后续新增功能在 items 中追加即可。
 */
export default function TableList({ tables, selected, view, onSelectTable, onNavigate }: TableListProps) {
  return (
    <Menu
      theme="light"
      mode="inline"
      selectedKeys={view === 'tables' && selected ? [`${TABLE_KEY_PREFIX}${selected}`] : [view]}
      defaultOpenKeys={['tables']}
      onClick={({ key }) => {
        if (NAV_KEYS.has(key)) {
          onNavigate(key as 'home' | 'query')
        } else if (key.startsWith(TABLE_KEY_PREFIX)) {
          onSelectTable(key.slice(TABLE_KEY_PREFIX.length))
        }
      }}
      items={[
        { key: 'home', icon: <HomeOutlined />, label: '主页' },
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
        },
        { key: 'query', icon: <SearchOutlined />, label: '查询' }
      ]}
    />
  )
}

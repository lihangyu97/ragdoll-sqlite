import { EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Menu, Tag } from 'antd'
import type { TableEntry } from '../../shared/types.js'

interface TableListProps {
  tables: TableEntry[]
  selected: string | null
  onSelect: (name: string) => void
}

/**
 * 侧边栏菜单：当前为「表与视图」分组（表/视图作为菜单项）。
 * 后续新增功能（如 SQL 编辑查询）时，在 items 中追加分组/菜单项即可。
 */
export default function TableList({ tables, selected, onSelect }: TableListProps) {
  if (tables.length === 0) {
    return <div className="sider-empty">数据库中没有表或视图</div>
  }
  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={selected ? [selected] : []}
      onClick={({ key }) => onSelect(String(key))}
      items={[
        {
          type: 'group',
          label: '表与视图',
          children: tables.map((t) => ({
            key: t.name,
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
            ),
          })),
        },
      ]}
    />
  )
}

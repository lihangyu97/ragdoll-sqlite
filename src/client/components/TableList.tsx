import { DatabaseOutlined, EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Empty, Tag } from 'antd'
import type { TableEntry } from '../../shared/types.js'

interface TableListProps {
  tables: TableEntry[]
  selected: string | null
  collapsed: boolean
  onSelect: (name: string) => void
}

/** 左侧侧边栏：表/视图清单（antd v6 已弃用 List，直接渲染条目） */
export default function TableList({ tables, selected, collapsed, onSelect }: TableListProps) {
  return (
    <>
      <div className="sider-title">
        <DatabaseOutlined />
        {!collapsed && <span>表与视图</span>}
      </div>
      {tables.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="数据库中没有表或视图"
          style={{ marginTop: 24 }}
        />
      ) : (
        <div style={{ paddingBottom: 8 }}>
          {tables.map((t) => (
            <div
              key={t.name}
              className={`sider-item${selected === t.name ? ' selected' : ''}`}
              onClick={() => onSelect(t.name)}
              title={collapsed ? t.name : undefined}
            >
              {t.type === 'view' ? <EyeOutlined /> : <TableOutlined />}
              {!collapsed && <span className="item-name">{t.name}</span>}
              {!collapsed && t.type === 'view' && (
                <Tag style={{ marginLeft: 'auto' }} color="cyan">
                  视图
                </Tag>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

import { Empty, Table, Tag, Typography } from 'antd'
import type { ColumnInfo, ForeignKeyInfo, IndexInfo, TableInfo } from '../../shared/types.js'

/** 「结构」Tab：字段 / 外键 / 索引三块信息 */
export default function StructureTable({ info }: { info: TableInfo }) {
  return (
    <div>
      <Typography.Title level={5}>字段（{info.columns.length}）</Typography.Title>
      <Table<ColumnInfo>
        size="small"
        rowKey="cid"
        dataSource={info.columns}
        pagination={false}
        columns={[
          { title: '#', dataIndex: 'cid', width: 60 },
          { title: '字段名', dataIndex: 'name' },
          {
            title: '类型',
            dataIndex: 'type',
            render: (t: string) => (t ? <Tag>{t}</Tag> : <span className="cell-null">—</span>)
          },
          {
            title: '主键',
            dataIndex: 'pk',
            width: 80,
            render: (v: number) => (v > 0 ? <Tag color="gold">PK-{v}</Tag> : null)
          },
          {
            title: '非空',
            dataIndex: 'notNull',
            width: 90,
            render: (v: boolean) => (v ? <Tag color="red">NOT NULL</Tag> : null)
          },
          {
            title: '默认值',
            dataIndex: 'defaultValue',
            render: (v: unknown) =>
              v === null || v === undefined ? <span className="cell-null">—</span> : String(v)
          }
        ]}
      />

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        外键（{info.foreignKeys.length}）
      </Typography.Title>
      {info.foreignKeys.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无外键" />
      ) : (
        <Table<ForeignKeyInfo>
          size="small"
          rowKey={(r, i) => `${r.id}-${i}`}
          dataSource={info.foreignKeys}
          pagination={false}
          columns={[
            { title: '字段', dataIndex: 'from' },
            { title: '→ 引用表', dataIndex: 'table' },
            {
              title: '→ 引用字段',
              dataIndex: 'to',
              render: (v: string | null) => v ?? <span className="cell-null">—</span>
            },
            { title: '更新', dataIndex: 'onUpdate' },
            { title: '删除', dataIndex: 'onDelete' }
          ]}
        />
      )}

      <Typography.Title level={5} style={{ marginTop: 24 }}>
        索引（{info.indexes.length}）
      </Typography.Title>
      {info.indexes.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无索引" />
      ) : (
        <Table<IndexInfo>
          size="small"
          rowKey="name"
          dataSource={info.indexes}
          pagination={false}
          columns={[
            { title: '索引名', dataIndex: 'name' },
            {
              title: '唯一',
              dataIndex: 'unique',
              width: 70,
              render: (v: boolean) => (v ? <Tag color="blue">唯一</Tag> : null)
            },
            { title: '类型', dataIndex: 'origin', width: 90 },
            {
              title: '部分',
              dataIndex: 'partial',
              width: 70,
              render: (v: boolean) => (v ? '是' : '否')
            },
            {
              title: '字段',
              dataIndex: 'columns',
              render: (cols: string[]) => cols.map(c => <Tag key={c}>{c}</Tag>)
            }
          ]}
        />
      )}
    </div>
  )
}

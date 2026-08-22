import { DatabaseOutlined, EyeOutlined, TableOutlined } from '@ant-design/icons'
import {
  Alert,
  Empty,
  Layout,
  List,
  Result,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from 'antd'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { BlobValue, ColumnInfo, ForeignKeyInfo, RowsResult, TableEntry, TableInfo } from '../shared/types.js'

const { Sider, Content } = Layout

const PAGE_SIZE_OPTIONS = [50, 100, 200, 500]

/** 带 token 的 API 请求封装 */
function apiFetch<T>(pathname: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(pathname, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const token = new URLSearchParams(window.location.search).get('t')
  if (token) url.searchParams.set('t', token)
  return fetch(url.toString()).then(async (res) => {
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `请求失败 (${res.status})`)
    }
    return res.json() as Promise<T>
  })
}

function renderCell(value: unknown, col: ColumnInfo): ReactNode {
  if (value === null || value === undefined) {
    return <span className="cell-null">NULL</span>
  }
  if (typeof value === 'object' && value !== null && (value as BlobValue).__blob) {
    const blob = value as BlobValue
    const preview = blob.hex.length > 0 ? `hex: ${blob.hex}${blob.bytes > 16 ? '…' : ''}` : '（空 BLOB）'
    return (
      <Tooltip title={preview}>
        <span className="cell-blob">BLOB({blob.bytes} bytes)</span>
      </Tooltip>
    )
  }
  const str = String(value)
  return typeof value === 'number' ? <span className="cell-number">{str}</span> : <span className="cell-text">{str}</span>
}

export default function App() {
  const [tables, setTables] = useState<TableEntry[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [rows, setRows] = useState<RowsResult | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [loadingRows, setLoadingRows] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<TableEntry[]>('/api/tables')
      .then((list) => {
        setTables(list)
        if (list.length > 0) setSelected(list[0].name)
      })
      .catch((err) => setTablesError((err as Error).message))
  }, [])

  const selectTable = useCallback((name: string) => {
    setSelected(name)
    setPage(1)
    setInfo(null)
    setRows(null)
    setDataError(null)
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoadingInfo(true)
    apiFetch<TableInfo>(`/api/tables/${encodeURIComponent(selected)}`)
      .then(setInfo)
      .catch((err) => setDataError((err as Error).message))
      .finally(() => setLoadingInfo(false))
  }, [selected])

  useEffect(() => {
    if (!selected) return
    setLoadingRows(true)
    apiFetch<RowsResult>(`/api/tables/${encodeURIComponent(selected)}/rows`, { page, pageSize })
      .then(setRows)
      .catch((err) => setDataError((err as Error).message))
      .finally(() => setLoadingRows(false))
  }, [selected, page, pageSize])

  if (tablesError) {
    return <Result status="error" title="加载失败" subTitle={tablesError} />
  }
  if (tables === null) {
    return (
      <div className="loading-wrap">
        <Spin size="large" />
      </div>
    )
  }

  const renderDataTab = () => {
    if (!info) return null
    if (loadingRows && !rows) {
      return (
        <div className="loading-wrap">
          <Spin size="large" />
        </div>
      )
    }
    if (!rows) return null
    const columns: TableColumnsType<Record<string, unknown>> = [
      {
        title: '#',
        key: '__row',
        width: 60,
        render: (_v, _r, index) => (rows.page - 1) * rows.pageSize + index + 1,
      },
      ...info.columns.map((c) => ({
        title: (
          <Tooltip title={`${c.name}${c.type ? ` : ${c.type}` : ''}${c.pk > 0 ? '（主键）' : ''}${c.notNull ? '（非空）' : ''}`}>
            <span>{c.name}</span>
          </Tooltip>
        ),
        dataIndex: c.name,
        key: c.name,
        ellipsis: true,
        render: (v: unknown) => renderCell(v, c),
      })),
    ]
    return (
      <Table<Record<string, unknown>>
        size="small"
        columns={columns}
        dataSource={rows.rows}
        rowKey={(_r, i) => `${rows.page}-${i}`}
        loading={loadingRows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: rows.page,
          pageSize: rows.pageSize,
          total: rows.total,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          showTotal: (total) => `共 ${total.toLocaleString()} 行`,
          onChange: (p, ps) => {
            setPage(p)
            setPageSize(ps)
          },
        }}
      />
    )
  }

  const renderStructureTab = () => {
    if (!info) return null
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
              render: (t: string) =>
                t ? <Tag>{t}</Tag> : <span className="cell-null">—</span>,
            },
            {
              title: '主键',
              dataIndex: 'pk',
              width: 80,
              render: (v: number) => (v > 0 ? <Tag color="gold">PK-{v}</Tag> : null),
            },
            {
              title: '非空',
              dataIndex: 'notNull',
              width: 90,
              render: (v: boolean) => (v ? <Tag color="red">NOT NULL</Tag> : null),
            },
            {
              title: '默认值',
              dataIndex: 'defaultValue',
              render: (v: unknown) =>
                v === null || v === undefined ? <span className="cell-null">—</span> : String(v),
            },
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
                render: (v: string | null) =>
                  v ?? <span className="cell-null">—</span>,
              },
              { title: '更新', dataIndex: 'onUpdate' },
              { title: '删除', dataIndex: 'onDelete' },
            ]}
          />
        )}

        <Typography.Title level={5} style={{ marginTop: 24 }}>
          索引（{info.indexes.length}）
        </Typography.Title>
        {info.indexes.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无索引" />
        ) : (
          <Table
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
                render: (v: boolean) => (v ? <Tag color="blue">唯一</Tag> : null),
              },
              { title: '类型', dataIndex: 'origin', width: 90 },
              {
                title: '部分',
                dataIndex: 'partial',
                width: 70,
                render: (v: boolean) => (v ? '是' : '否'),
              },
              {
                title: '字段',
                dataIndex: 'columns',
                render: (cols: string[]) => cols.map((c) => <Tag key={c}>{c}</Tag>),
              },
            ]}
          />
        )}
      </div>
    )
  }

  return (
    <Layout className="app-layout">
      <Sider width={260} theme="light" className="app-sider">
        <div className="sider-title">
          <DatabaseOutlined />
          表与视图
        </div>
        {tables.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="数据库中没有表或视图" style={{ marginTop: 24 }} />
        ) : (
          <List
            size="small"
            dataSource={tables}
            renderItem={(t) => (
              <div
                key={t.name}
                className={`sider-item${selected === t.name ? ' selected' : ''}`}
                onClick={() => selectTable(t.name)}
              >
                {t.type === 'view' ? <EyeOutlined /> : <TableOutlined />}
                <span className="item-name">{t.name}</span>
                {t.type === 'view' && (
                  <Tag style={{ marginLeft: 'auto' }} color="cyan">
                    视图
                  </Tag>
                )}
              </div>
            )}
          />
        )}
      </Sider>
      <Content className="app-content">
        {!info ? (
          dataError ? (
            <Alert type="error" showIcon message={dataError} />
          ) : (
            <div className="loading-wrap">
              <Spin size="large" />
            </div>
          )
        ) : (
          <>
            <div className="table-header">
              <Typography.Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {info.type === 'view' ? <EyeOutlined /> : <TableOutlined />}
                {info.name}
                <Tag>{info.type === 'view' ? '视图' : '表'}</Tag>
                <Typography.Text type="secondary">共 {info.rowCount.toLocaleString()} 行</Typography.Text>
              </Typography.Title>
            </div>
            {dataError && (
              <Alert
                type="error"
                showIcon
                message={dataError}
                style={{ marginBottom: 12 }}
                closable
                onClose={() => setDataError(null)}
              />
            )}
            <Tabs
              items={[
                { key: 'data', label: '数据', children: renderDataTab() },
                { key: 'structure', label: '结构', children: renderStructureTab() },
              ]}
            />
          </>
        )}
      </Content>
    </Layout>
  )
}

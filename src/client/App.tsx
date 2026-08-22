import { EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Alert, Empty, Layout, Result, Spin, Tabs, Tag, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RowsResult, TableInfo, TableSchemaEntry } from '../shared/types.js'
import { apiFetch } from './api.js'
import DataTable from './components/DataTable.js'
import StructureTable from './components/StructureTable.js'
import TableList from './components/TableList.js'

const { Sider, Content } = Layout

/**
 * 应用容器：负责状态与数据获取（表清单+全部表头预取 / 行数据 / 结构详情），
 * 布局组装（侧边栏 + 内容区），具体的 UI 渲染委托给 components/ 下的子组件。
 *
 * 加载策略：进入页面即预取全部表的字段（/api/tables），因此切换表时
 * 表头立即可用，行数据在表格内部 loading，不再整页替换。
 */
export default function App() {
  const [schemas, setSchemas] = useState<TableSchemaEntry[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [info, setInfo] = useState<TableInfo | null>(null)
  const [rows, setRows] = useState<RowsResult | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loadingRows, setLoadingRows] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  // 请求序号守卫：切换表/翻页后，丢弃过期请求的响应，避免旧数据覆盖新状态（卡 loading/闪错数据）
  const infoSeq = useRef(0)
  const rowsSeq = useRef(0)

  // 初始加载：表/视图清单 + 全部表字段（一次请求），并自动选中第一个
  useEffect(() => {
    apiFetch<TableSchemaEntry[]>('/api/tables')
      .then((list) => {
        // 防御：旧版服务端进程不返回 columns，导致页面白屏，给明确提示
        if (!list.every((s) => Array.isArray(s.columns))) {
          setTablesError('服务端响应缺少表字段信息。可能是旧的服务进程仍在运行，请先停止旧的 ragdoll-sqlite 再重新启动。')
          return
        }
        setSchemas(list)
        if (list.length > 0) setSelected(list[0].name)
      })
      .catch((err) => setTablesError((err as Error).message))
  }, [])

  const selectTable = useCallback((name: string) => {
    setSelected(name)
    setPage(1)
    setInfo(null)
    // 不清空 rows：旧行保留在 loading 遮罩下，避免表格塌缩导致滚动条闪烁
    setDataError(null)
  }, [])

  // 加载选中表的结构详情（外键/索引；字段已由 schema 预取，无需等待）
  useEffect(() => {
    if (!selected) return
    const seq = ++infoSeq.current
    apiFetch<TableInfo>(`/api/tables/${encodeURIComponent(selected)}`)
      .then((data) => {
        if (seq !== infoSeq.current) return // 过期响应，丢弃
        setDataError(null)
        setInfo(data)
      })
      .catch((err) => {
        if (seq !== infoSeq.current) return
        setDataError((err as Error).message)
      })
  }, [selected])

  // 加载选中表的分页数据
  useEffect(() => {
    if (!selected) return
    const seq = ++rowsSeq.current
    setLoadingRows(true)
    apiFetch<RowsResult>(`/api/tables/${encodeURIComponent(selected)}/rows`, { page, pageSize })
      .then((data) => {
        if (seq !== rowsSeq.current) return
        setDataError(null)
        setRows(data)
      })
      .catch((err) => {
        if (seq !== rowsSeq.current) return
        setDataError((err as Error).message)
      })
      .finally(() => {
        if (seq === rowsSeq.current) setLoadingRows(false)
      })
  }, [selected, page, pageSize])

  const handlePageChange = useCallback((p: number, ps: number) => {
    setPage(p)
    setPageSize(ps)
  }, [])

  // ---- 全局状态：加载失败 / 首次加载中 ----
  if (tablesError) {
    return <Result status="error" title="加载失败" subTitle={tablesError} />
  }
  if (schemas === null) {
    return (
      <div className="loading-wrap">
        <Spin size="large" />
      </div>
    )
  }

  const selectedSchema = schemas.find((s) => s.name === selected) ?? null
  // 行数：加载中显示 …，优先取分页结果（已含 total），详情接口返回前再取 rowCount
  const rowCountText = loadingRows
    ? '…'
    : rows
      ? rows.total.toLocaleString()
      : info
        ? info.rowCount.toLocaleString()
        : '…'

  return (
    <Layout className="app-layout">
      <Sider
        width={260}
        theme="light"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        className="app-sider"
      >
        <TableList tables={schemas} selected={selected} collapsed={collapsed} onSelect={selectTable} />
      </Sider>

      <Content className="app-content">
        {selectedSchema === null ? (
          <Empty description="数据库中没有表或视图" style={{ marginTop: 80 }} />
        ) : (
          <>
            <div className="table-header">
              <Typography.Title
                level={4}
                style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {selectedSchema.type === 'view' ? <EyeOutlined /> : <TableOutlined />}
                {selectedSchema.name}
                <Tag>{selectedSchema.type === 'view' ? '视图' : '表'}</Tag>
                <Typography.Text type="secondary">共 {rowCountText} 行</Typography.Text>
              </Typography.Title>
            </div>
            {dataError && (
              <Alert
                type="error"
                showIcon
                title={dataError}
                style={{ marginBottom: 12 }}
                closable={{ onClose: () => setDataError(null) }}
              />
            )}
            <Tabs
              items={[
                {
                  key: 'data',
                  label: '数据',
                  children: (
                    <DataTable
                      tableName={selectedSchema.name}
                      columns={selectedSchema.columns}
                      rows={rows}
                      loading={loadingRows}
                      onPageChange={handlePageChange}
                    />
                  ),
                },
                {
                  key: 'structure',
                  label: '结构',
                  children: <StructureTable columns={selectedSchema.columns} info={info} />,
                },
              ]}
            />
          </>
        )}
      </Content>
    </Layout>
  )
}

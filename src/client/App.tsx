import { EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Alert, Empty, Layout, Result, Spin, Tabs, Tag, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RowsResult, TableEntry, TableInfo } from '../shared/types.js'
import { apiFetch } from './api.js'
import DataTable from './components/DataTable.js'
import StructureTable from './components/StructureTable.js'
import TableList from './components/TableList.js'

const { Sider, Content } = Layout

/**
 * 应用容器：负责状态与数据获取（表清单 / 表结构 / 分页数据），
 * 布局组装（侧边栏 + 内容区），具体的 UI 渲染委托给 components/ 下的子组件。
 */
export default function App() {
  const [tables, setTables] = useState<TableEntry[] | null>(null)
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

  // 初始加载表/视图清单，并自动选中第一个
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

  // 加载选中表的结构
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

  // ---- 全局状态：加载失败 / 加载中 ----
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
        <TableList tables={tables} selected={selected} collapsed={collapsed} onSelect={selectTable} />
      </Sider>

      <Content className="app-content">
        {!info ? (
          dataError ? (
            <Alert type="error" showIcon title={dataError} />
          ) : tables.length === 0 ? (
            <Empty description="数据库中没有表或视图" style={{ marginTop: 80 }} />
          ) : (
            <div className="loading-wrap">
              <Spin size="large" />
            </div>
          )
        ) : (
          <>
            <div className="table-header">
              <Typography.Title
                level={4}
                style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {info.type === 'view' ? <EyeOutlined /> : <TableOutlined />}
                {info.name}
                <Tag>{info.type === 'view' ? '视图' : '表'}</Tag>
                <Typography.Text type="secondary">
                  共 {info.rowCount.toLocaleString()} 行
                </Typography.Text>
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
                  children: rows ? (
                    <DataTable
                      info={info}
                      rows={rows}
                      loading={loadingRows}
                      onPageChange={handlePageChange}
                    />
                  ) : loadingRows ? (
                    <div className="loading-wrap">
                      <Spin size="large" />
                    </div>
                  ) : (
                    <Empty description="暂无数据" />
                  ),
                },
                { key: 'structure', label: '结构', children: <StructureTable info={info} /> },
              ]}
            />
          </>
        )}
      </Content>
    </Layout>
  )
}

import { EyeOutlined, MenuFoldOutlined, MenuUnfoldOutlined, TableOutlined } from '@ant-design/icons'
import { Alert, Empty, Layout, Result, Spin, Tabs, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import type { TableSchemaEntry } from '../shared/types.js'
import { apiFetch } from './api.js'
import DataTable from './components/DataTable.js'
import StructureTable from './components/StructureTable.js'
import TableList from './components/TableList.js'
import { useTableData } from './useTableData.js'

const { Sider, Content } = Layout

/**
 * 应用容器：负责状态与数据获取（表清单+全部表头预取 / 行数据 / 结构详情），
 * 布局组装（侧边栏 + 内容区），数据获取逻辑在 useTableData hook 中。
 *
 * 加载策略：进入页面即预取全部表的字段（/api/tables，大库阈值内），
 * 切换表时表头立即可用，行数据在表格内部 loading；超大库（>50 表）由详情接口按需取字段。
 */
export default function App() {
  const [schemas, setSchemas] = useState<TableSchemaEntry[] | null>(null)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const { selected, select, info, rows, loadingRows, dataError, clearError, onPageChange } =
    useTableData()

  // 初始加载：表/视图清单 + 字段预取（一次请求），并自动选中第一个
  useEffect(() => {
    apiFetch<TableSchemaEntry[]>('/api/tables')
      .then(list => {
        // 防御：旧版服务端进程不返回 columns，导致页面白屏，给明确提示
        if (!list.every(s => Array.isArray(s.columns))) {
          setTablesError(
            '服务端响应缺少表字段信息。可能是旧的服务进程仍在运行，请先停止旧的 ragdoll-sqlite 再重新启动。'
          )
          return
        }
        setSchemas(list)
        if (list.length > 0) select(list[0].name)
      })
      .catch(err => setTablesError((err as Error).message))
  }, [select])

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

  const selectedSchema = schemas.find(s => s.name === selected) ?? null
  // 超大库（>50 表）时 schema 不带字段 → 用详情接口的 columns 兜底
  const tableColumns =
    selectedSchema && selectedSchema.columns.length > 0
      ? selectedSchema.columns
      : (info?.columns ?? [])
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
        width={240}
        collapsedWidth={80}
        theme="light"
        collapsible
        collapsed={collapsed}
        trigger={null}
        className="app-sider"
      >
        <div className="sider-logo">
          <img src="/favicon.svg" alt="RagdollSqlite" className="sider-logo-icon" />
          {!collapsed && <span className="sider-logo-title">RagdollSqlite</span>}
        </div>
        <TableList tables={schemas} selected={selected} onSelect={select} />
        <div
          className="sider-trigger"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          {!collapsed && <span>收起</span>}
        </div>
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
                closable={{ onClose: clearError }}
              />
            )}
            <Tabs
              items={[
                {
                  key: 'data',
                  label: '数据',
                  children:
                    tableColumns.length === 0 ? (
                      <div className="loading-wrap">
                        <Spin size="large" />
                      </div>
                    ) : (
                      <DataTable
                        key={selectedSchema.name}
                        tableName={selectedSchema.name}
                        columns={tableColumns}
                        rows={rows}
                        loading={loadingRows}
                        onPageChange={onPageChange}
                      />
                    )
                },
                {
                  key: 'structure',
                  label: '结构',
                  children: <StructureTable columns={tableColumns} info={info} />
                }
              ]}
            />
          </>
        )}
      </Content>
    </Layout>
  )
}

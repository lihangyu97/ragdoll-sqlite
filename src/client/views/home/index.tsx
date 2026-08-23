import {
  CopyOutlined,
  DatabaseOutlined,
  EyeOutlined,
  SwapOutlined,
  TableOutlined
} from '@ant-design/icons'
import {
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  message,
  Modal,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Tooltip,
  Typography
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { DatabaseInfo } from '@shared/types'
import { fetchDatabases, switchDatabase } from '@/api'
import { useSchemas } from '@/context/SchemasContext'
import './index.css'

/** 文件大小人性化 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/**
 * 主页：库总览 Dashboard + 当前数据库（路径展示 + 切换）。
 * - 当前数据库卡片：路径（可复制）/大小/表数，切换按钮（手动输入路径或最近打开）
 * - 统计条：表/视图数量、总行数、库文件大小
 * - 表卡片墙：每张表/视图一张卡片（类型/字段数/行数），点击直达数据页
 */
export default function HomePage() {
  const { schemas, refresh: refreshSchemas } = useSchemas()
  const navigate = useNavigate()
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null)
  const [switchOpen, setSwitchOpen] = useState(false)
  const [switchPath, setSwitchPath] = useState('')
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    fetchDatabases()
      .then(setDbInfo)
      .catch(() => setDbInfo(null)) // 失败不阻塞主页
  }, [])

  /** 执行切换：手动输入或最近打开列表点击 */
  const handleSwitch = useCallback(
    async (path?: string) => {
      const target = (path ?? switchPath).trim()
      if (!target) {
        message.warning('请输入数据库路径')
        return
      }
      setSwitching(true)
      try {
        const info = await switchDatabase(target)
        setDbInfo(info)
        refreshSchemas() // 重拉表清单（全局加载态后页面用新库）
        message.success('已切换数据库')
        setSwitchOpen(false)
        setSwitchPath('')
      } catch (err) {
        message.error((err as Error).message)
      } finally {
        setSwitching(false)
      }
    },
    [switchPath, refreshSchemas]
  )

  /** 复制当前库路径 */
  const copyPath = useCallback(async () => {
    if (!dbInfo?.current) return
    try {
      await navigator.clipboard.writeText(dbInfo.current.path)
      message.success('路径已复制')
    } catch {
      message.warning('复制失败，请手动复制')
    }
  }, [dbInfo])

  if (schemas === null) return null

  const current = dbInfo?.current ?? null
  const tableCount = schemas.filter(s => s.type === 'table').length
  const viewCount = schemas.length - tableCount
  const dbSize = current ? formatBytes(current.dbSizeBytes) : null
  const rowCountOf = (name: string) => current?.tables.find(t => t.name === name)?.rowCount

  if (schemas.length === 0) {
    return <Empty description="数据库中没有表或视图" style={{ marginTop: 120 }} />
  }

  return (
    <div className="home-dashboard">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        库总览
      </Typography.Title>

      {/* 当前数据库卡片 */}
      <Card size="small" className="home-db-card" style={{ marginBottom: 16 }}>
        <Space size="middle" wrap align="center">
          <DatabaseOutlined className="home-type-icon" />
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong ellipsis style={{ maxWidth: 420 }} copyable={false}>
              {current ? current.path : '…'}
            </Typography.Text>
            <div className="home-db-meta">
              <span>{current ? `${formatBytes(current.dbSizeBytes)}` : '…'}</span>
              <span>· {tableCount} 张表</span>
              <span>· {viewCount} 个视图</span>
              <span>· {current ? current.totalRows.toLocaleString() : '…'} 行</span>
            </div>
          </div>
          {current && (
            <Tooltip title="复制路径">
              <Button size="small" icon={<CopyOutlined />} onClick={copyPath} />
            </Tooltip>
          )}
          <Button
            size="small"
            type="primary"
            icon={<SwapOutlined />}
            onClick={() => setSwitchOpen(true)}
          >
            切换数据库
          </Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} className="home-stats">
        <Col xs={12} md={6}>
          <Statistic title="表" value={tableCount} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="视图" value={viewCount} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="总行数" value={current ? current.totalRows.toLocaleString() : '…'} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="库大小" value={dbSize ?? '…'} />
        </Col>
      </Row>
      <Row gutter={[16, 16]} className="home-cards">
        {schemas.map(s => (
          <Col key={s.name} xs={24} sm={12} md={8} lg={6}>
            <Card hoverable onClick={() => navigate(`/table?table=${encodeURIComponent(s.name)}`)}>
              <Card.Meta
                avatar={
                  s.type === 'view' ? (
                    <EyeOutlined className="home-type-icon home-type-view" />
                  ) : (
                    <TableOutlined className="home-type-icon" />
                  )
                }
                title={<span className="home-card-name">{s.name}</span>}
                description={
                  <div className="home-card-meta">
                    <Tag color={s.type === 'view' ? 'cyan' : 'green'}>
                      {s.type === 'view' ? '视图' : '表'}
                    </Tag>
                    <span className="home-card-field">
                      {s.columns.length > 0 ? `${s.columns.length} 字段` : '-'}
                    </span>
                    <span className="home-card-row">{rowCountOf(s.name) ?? '…'} 行</span>
                  </div>
                }
              />
            </Card>
          </Col>
        ))}
      </Row>
      <div className="home-hint">
        <DatabaseOutlined /> 点击卡片进入对应表/视图（只读）
      </div>

      {/* 切换数据库 */}
      <Modal
        title="切换数据库"
        open={switchOpen}
        onCancel={() => setSwitchOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            autoFocus
            placeholder="输入数据库文件路径（如 /data/app.db）"
            value={switchPath}
            onChange={e => setSwitchPath(e.target.value)}
            onPressEnter={() => handleSwitch()}
          />
          <Button type="primary" loading={switching} onClick={() => handleSwitch()}>
            打开
          </Button>
        </Space.Compact>
        {dbInfo && dbInfo.recent.length > 0 && (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              最近打开
            </Typography.Text>
            <List
              size="small"
              dataSource={dbInfo.recent}
              renderItem={item => (
                <List.Item style={{ cursor: 'pointer' }} onClick={() => handleSwitch(item.path)}>
                  <Typography.Text ellipsis style={{ maxWidth: 420 }}>
                    {item.path}
                  </Typography.Text>
                </List.Item>
              )}
            />
          </>
        )}
        {switching && (
          <div className="loading-wrap">
            <Spin size="large" />
          </div>
        )}
      </Modal>
    </div>
  )
}

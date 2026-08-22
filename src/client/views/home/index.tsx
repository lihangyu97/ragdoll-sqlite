import { DatabaseOutlined, EyeOutlined, TableOutlined } from '@ant-design/icons'
import { Card, Col, Empty, Row, Statistic, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Overview } from '@shared/types'
import { fetchOverview } from '@/api'
import { useSchemas } from '@/SchemasContext'
import './index.css'

/** 文件大小人性化 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/**
 * 主页：库总览 Dashboard。
 * - 统计条：表/视图数量、总行数、库文件大小（行数/大小来自 /api/overview，复用行数缓存）
 * - 表卡片墙：每张表/视图一张卡片（类型/字段数/行数），点击直达数据页
 */
export default function HomePage() {
  const { schemas } = useSchemas()
  const navigate = useNavigate()
  const [overview, setOverview] = useState<Overview | null>(null)

  useEffect(() => {
    fetchOverview()
      .then(setOverview)
      .catch(() => setOverview(null)) // overview 失败不阻塞主页，仅缺行数/大小
  }, [])

  if (schemas === null) return null

  const tableCount = schemas.filter(s => s.type === 'table').length
  const viewCount = schemas.length - tableCount
  const totalRows = overview?.totalRows
  const dbSize = overview ? formatBytes(overview.dbSizeBytes) : null
  const rowCountOf = (name: string) => overview?.tables.find(t => t.name === name)?.rowCount

  if (schemas.length === 0) {
    return <Empty description="数据库中没有表或视图" style={{ marginTop: 120 }} />
  }

  return (
    <div className="home-dashboard">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        库总览
      </Typography.Title>
      <Row gutter={[16, 16]} className="home-stats">
        <Col xs={12} md={6}>
          <Statistic title="表" value={tableCount} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="视图" value={viewCount} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="总行数" value={totalRows ?? '…'} />
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
    </div>
  )
}

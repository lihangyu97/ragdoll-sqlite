import { DeleteOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { App as AntdApp, Alert, Button, Input, Space, Spin, Tag, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { CustomView, QueryResult } from '@shared/types'
import { runQuery } from '@/api'
import QueryResultTable from '@/components/QueryResultTable'
import SqlEditor from '@/components/SqlEditor'
import { useViews } from '@/context/ViewsContext'

interface CustomViewPanelProps {
  view: CustomView
}

/**
 * 自定义视图页（/table?viewId=，与表/视图共用表数据路由，参数区分）：
 * 展示视图的 SQL 与执行结果表；可编辑视图名与 SQL（CodeMirror 编辑器）、删除视图。
 */
export default function CustomViewPanel({ view }: CustomViewPanelProps) {
  const { message } = AntdApp.useApp()
  const { update, remove } = useViews()
  const navigate = useNavigate()
  const [name, setName] = useState(view.name)
  const [sql, setSql] = useState(view.sql)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 执行一段 SQL（首次加载与手动执行共用） */
  const run = useCallback((sqlText: string) => {
    const trimmed = sqlText.trim()
    if (!trimmed) return
    setRunning(true)
    setError(null)
    runQuery(trimmed)
      .then(setResult)
      .catch(err => {
        setResult(null)
        setError((err as Error).message)
      })
      .finally(() => setRunning(false))
  }, [])

  // 首次加载自动执行（组件由父级按 view.id 重挂载，切视图会重置）
  useEffect(() => {
    // 微任务中执行，规避 react-hooks/set-state-in-effect 规则
    queueMicrotask(() => run(view.sql))
  }, [view.sql, run])

  /** 保存名称与 SQL（保存后重新执行） */
  const handleSave = async () => {
    const trimmedName = name.trim()
    const trimmedSql = sql.trim()
    if (!trimmedName || !trimmedSql) {
      message.warning('名称与 SQL 不能为空')
      return
    }
    setSaving(true)
    try {
      await update(view.id, { name: trimmedName, sql: trimmedSql })
      message.success('视图已保存')
      run(trimmedSql)
    } catch (err) {
      message.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** 删除视图并回到表数据页 */
  const handleDelete = async () => {
    try {
      await remove(view.id)
      message.success('视图已删除')
      navigate('/table', { replace: true })
    } catch (err) {
      message.error((err as Error).message)
    }
  }

  return (
    <div className="custom-view-panel">
      <div className="table-header">
        <Space size="middle" wrap>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: 240 }}
            placeholder="视图名称"
            maxLength={50}
          />
          <Tag color="geekblue">自定义视图</Tag>
          <Typography.Text type="secondary">
            {result ? `共 ${result.total.toLocaleString()} 行` : ''}
          </Typography.Text>
          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={running}
            onClick={() => run(sql)}
          >
            执行
          </Button>
          <Button size="small" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
            保存
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDelete}>
            删除
          </Button>
        </Space>
      </div>

      {/* SQL 编辑器（与查询页同款：高亮 + 表/列补全；Cmd/Ctrl+Enter 执行选区/当前行） */}
      <div style={{ marginBottom: 12 }}>
        <SqlEditor value={sql} onChange={setSql} onRun={run} />
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          style={{ marginBottom: 12 }}
          closable={{ onClose: () => setError(null) }}
        />
      )}

      {running ? (
        <div className="loading-wrap">
          <Spin size="large" />
        </div>
      ) : result ? (
        <QueryResultTable result={result} />
      ) : null}
    </div>
  )
}

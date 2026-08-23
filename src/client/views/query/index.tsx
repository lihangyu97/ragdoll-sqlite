import { CaretRightOutlined, SaveOutlined } from '@ant-design/icons'
import { App as AntdApp, Alert, Button, Empty, Input, Modal, Space, Spin, Typography } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { QueryResult } from '@shared/types'
import { fetchDraft, runQuery, saveDraft } from '@/api'
import QueryResultTable from '@/components/QueryResultTable'
import SqlEditor, { type SqlEditorHandle } from '@/components/SqlEditor'
import { useSchemas } from '@/context/SchemasContext'
import { useViews } from '@/context/ViewsContext'
import './index.css'

/** 草稿防抖保存间隔（避免每次按键都写 views.db） */
const DRAFT_SAVE_DEBOUNCE_MS = 500

/**
 * 查询页（SQL 控制台）：
 * - 上方 SqlEditor（CodeMirror：高亮 + 表/列补全 + 自动表名补全）
 * - 执行：按钮或 Cmd/Ctrl+Enter，取**选中文本**（无选区则取光标所在行）
 * - 下方结果表（前端分页，NULL/BLOB 安全展示，最多 1000 行）
 * - 草稿持久化：内容防抖保存到服务端 views.db（跨会话/重启不丢）
 * - 保存为视图：把当前 SQL 存为自定义视图（管理在「自定义视图」页）
 */
export default function QueryPage() {
  const { message } = AntdApp.useApp()
  const { schemas } = useSchemas()
  const { create } = useViews()
  const editorRef = useRef<SqlEditorHandle>(null)
  const saveTimer = useRef<number | null>(null)
  const [sqlText, setSqlText] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')

  /** 执行一段完整 SQL */
  const runSql = useCallback((sql: string) => {
    const trimmed = sql.trim()
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

  // 初始化编辑器内容：优先服务端草稿（跨会话保留），无草稿给一行示例 SQL
  useEffect(() => {
    if (!schemas || schemas.length === 0) return
    let cancelled = false
    fetchDraft()
      .then(({ sql }) => {
        if (cancelled) return
        // 微任务中 setState，规避 react-hooks/set-state-in-effect 规则
        queueMicrotask(() => {
          setSqlText(prev =>
            prev === '' ? sql || `SELECT * FROM ${schemas[0].name} LIMIT 20` : prev
          )
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [schemas])

  // 卸载时清理未触发的防抖定时器
  useEffect(
    () => () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    },
    []
  )

  /** 编辑器内容变化：立即更新 UI，防抖保存草稿到服务端 views.db */
  const handleSqlChange = useCallback((value: string) => {
    setSqlText(value)
    if (saveTimer.current !== null) clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveDraft(value).catch(() => {}) // 保存失败静默，不影响编辑
    }, DRAFT_SAVE_DEBOUNCE_MS)
  }, [])

  /** 保存当前 SQL 为自定义视图 */
  const handleSave = useCallback(async () => {
    const name = viewName.trim()
    if (!name) {
      message.warning('请输入视图名称')
      return
    }
    try {
      await create(name, sqlText)
      message.success('视图已保存，可在左侧「自定义视图」中查看')
      setSaveOpen(false)
      setViewName('')
    } catch (err) {
      message.error((err as Error).message)
    }
  }, [viewName, sqlText, create, message])

  return (
    <div className="query-page">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        查询
      </Typography.Title>
      <div className="query-editor">
        <SqlEditor ref={editorRef} value={sqlText} onChange={handleSqlChange} onRun={runSql} />
        <div className="query-toolbar">
          <Space size="middle" wrap>
            <Button
              type="primary"
              size="small"
              icon={<CaretRightOutlined />}
              loading={running}
              onClick={() => editorRef.current?.run()}
            >
              执行
            </Button>
            <Button
              size="small"
              icon={<SaveOutlined />}
              onClick={() => {
                setViewName('')
                setSaveOpen(true)
              }}
            >
              保存为视图
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              执行选中行 / 光标所在行（⌘/Ctrl + Enter）
            </Typography.Text>
          </Space>
        </div>
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

      <div className="query-result">
        {running ? (
          <div className="loading-wrap">
            <Spin size="large" />
          </div>
        ) : result ? (
          <QueryResultTable result={result} />
        ) : (
          <Empty description="执行 SQL 后在此预览结果" style={{ marginTop: 40 }} />
        )}
      </div>

      <Modal
        title="保存为视图"
        open={saveOpen}
        onCancel={() => setSaveOpen(false)}
        onOk={handleSave}
        okText="保存"
        destroyOnHidden
      >
        <Input
          autoFocus
          placeholder="视图名称（左侧「自定义视图」菜单可见，可后续编辑）"
          value={viewName}
          onChange={e => setViewName(e.target.value)}
          onPressEnter={handleSave}
          maxLength={50}
        />
      </Modal>
    </div>
  )
}

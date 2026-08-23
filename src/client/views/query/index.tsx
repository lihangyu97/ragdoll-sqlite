import { CaretRightOutlined } from '@ant-design/icons'
import { sql } from '@codemirror/lang-sql'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { Prec } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { Alert, Button, Empty, Space, Spin, Table, Tag, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QueryResult } from '@shared/types'
import { runQuery } from '@/api'
import CellValue from '@/components/CellValue'
import { useSchemas } from '@/SchemasContext'
import './index.css'

/** SQL 草稿的 localStorage key（同一会话内刷新/切页恢复用） */
const DRAFT_KEY = 'ragdoll.sqlDraft'

/** 安全读写 localStorage（隐私模式/配额异常时静默降级） */
function saveDraft(sql: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, sql)
  } catch {
    // 忽略：持久化失败不影响编辑
  }
}

/**
 * 表名自动补全源：FROM/JOIN/UPDATE/INTO 后输入时直接弹表名。
 * （lang-sql 的 schema 补全在表名空位置不自动触发，仅 Ctrl+Space 显式触发，这里补上自动触发）
 */
function tableCompletionSource(
  tableNames: string[]
): (context: CompletionContext) => CompletionResult | null {
  return context => {
    const before = context.state.sliceDoc(Math.max(0, context.pos - 60), context.pos)
    if (!/(?:FROM|JOIN|UPDATE|INTO|TABLE)\s+[\w"`]*$/i.test(before)) return null
    const word = (before.match(/[\w"`]+$/) ?? [''])[0].replace(/["`]/g, '')
    const options = tableNames
      .filter(t => t.startsWith(word))
      .map(t => ({ label: t, type: 'type' }))
    if (options.length === 0) return null
    return { from: context.pos - word.length, options }
  }
}

/**
 * 查询页（SQL 控制台）：
 * - 上方 CodeMirror 编辑器（SQL 高亮 + 表/列补全，数据源来自表清单）
 * - 执行：按钮或 Cmd/Ctrl+Enter，取**选中文本**（无选区则取光标所在行）
 * - 下方结果表（前端分页，NULL/BLOB 安全展示，最多 1000 行）
 */
export default function QueryPage() {
  const { schemas } = useSchemas()
  const editorRef = useRef<ReactCodeMirrorRef>(null)
  // 草稿持久化：localStorage 按 origin（含端口）隔离，同一会话内刷新/切页不丢
  const [sqlText, setSqlText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 补全 schema：表名 → 列名数组（lang-sql 6.x 的 SQLNamespace 递归结构，叶子为列）
  const sqlSchema = useMemo(() => {
    const schema: Record<string, string[]> = {}
    for (const s of schemas ?? []) {
      schema[s.name] = s.columns.map(c => c.name)
    }
    return schema
  }, [schemas])

  // 表名列表（自动补全源用）
  const tableNames = useMemo(() => (schemas ?? []).map(s => s.name), [schemas])

  /** 在指定编辑器视图上执行选区/当前行 SQL（keymap 与按钮共用，不依赖 ref） */
  const executeView = useCallback((view: EditorView) => {
    const { state } = view
    const { from, to } = state.selection.main
    // 有选区 → 执行选中的 SQL；无选区 → 执行光标所在行
    const sql = from === to ? state.doc.lineAt(from).text : state.sliceDoc(from, to)
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

  const execute = useCallback(() => {
    const view = editorRef.current?.view
    if (view) executeView(view)
  }, [executeView])

  const extensions = useMemo(() => {
    const sqlExt = sql({ schema: sqlSchema })
    return [
      sqlExt,
      // 输入 FROM/JOIN 等后自动弹表名（优先于 lang-sql 默认源）
      Prec.highest(sqlExt.language.data.of({ autocomplete: tableCompletionSource(tableNames) })),
      // Cmd/Ctrl+Enter 执行（Mod-Enter），Prec.highest 防止其他 keymap 抢占
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: view => {
              executeView(view)
              return true
            }
          }
        ])
      )
    ]
  }, [sqlSchema, tableNames, executeView])

  // 初次给一行示例 SQL，方便直接回车执行
  useEffect(() => {
    if (schemas && schemas.length > 0) {
      // 微任务中 setState，规避 react-hooks/set-state-in-effect 规则
      queueMicrotask(() => {
        setSqlText(prev => (prev === '' ? `SELECT * FROM ${schemas[0].name} LIMIT 20` : prev))
      })
    }
  }, [schemas])

  const columns = useMemo(
    () => [
      {
        title: '#',
        key: '__row',
        width: 60,
        render: (_: unknown, r: Record<string, unknown>) => (
          <span className="cell-number">{String(r.__row)}</span>
        )
      },
      ...(result?.columns ?? []).map(c => ({
        title: c,
        dataIndex: c,
        key: c,
        ellipsis: true,
        render: (v: unknown) => <CellValue value={v} />
      }))
    ],
    [result]
  )

  return (
    <div className="query-page">
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        查询
      </Typography.Title>
      <div className="query-editor">
        <CodeMirror
          ref={editorRef}
          value={sqlText}
          height="200px"
          extensions={extensions}
          onChange={value => {
            setSqlText(value)
            saveDraft(value)
          }}
        />
        <div className="query-toolbar">
          <Space size="middle">
            <Button
              type="primary"
              size="small"
              icon={<CaretRightOutlined />}
              loading={running}
              onClick={execute}
            >
              执行
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
          <>
            <div className="query-result-meta">
              <Space size="middle" wrap>
                <Tag color="blue">{result.total.toLocaleString()} 行</Tag>
                {result.truncated && <Tag color="orange">超过 1000 行，仅显示前 1000 行</Tag>}
              </Space>
            </div>
            <Table<Record<string, unknown>>
              size="small"
              columns={columns}
              dataSource={result.rows}
              rowKey="__row"
              scroll={{ x: 'max-content' }}
              pagination={{
                size: 'medium',
                showSizeChanger: true,
                showTotal: t => `共 ${t.toLocaleString()} 行`
              }}
            />
          </>
        ) : (
          <Empty description="执行 SQL 后在此预览结果" style={{ marginTop: 40 }} />
        )}
      </div>
    </div>
  )
}

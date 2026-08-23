import { sql } from '@codemirror/lang-sql'
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { Prec, type Extension } from '@codemirror/state'
import { keymap, type EditorView } from '@codemirror/view'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react'
import { useSchemas } from '@/context/SchemasContext'

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

export interface SqlEditorHandle {
  /** 执行选区/光标所在行 SQL（触发 onRun；按钮与快捷键共用） */
  run: () => void
}

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  /** 提供后启用 Cmd/Ctrl+Enter 执行快捷键（回调收到选区/当前行 SQL） */
  onRun?: (sql: string) => void
}

/**
 * SQL 编辑器（CodeMirror 6）：SQL 高亮 + 表/列补全（数据源来自表清单）+ 自动表名补全。
 * 查询页与自定义视图页共用；提供 onRun 时支持 Cmd/Ctrl+Enter 执行选区/当前行。
 */
const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, onChange, height, onRun },
  ref
) {
  const { schemas } = useSchemas()
  const editorRef = useRef<ReactCodeMirrorRef>(null)

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

  /** 提取选区/当前行 SQL 并回调 onRun（keymap 与 ref.run 共用，不依赖 ref） */
  const runFromView = useCallback(
    (view: EditorView) => {
      if (!onRun) return
      const { state } = view
      const { from, to } = state.selection.main
      // 有选区 → 执行选中的 SQL；无选区 → 执行光标所在行
      const sql = from === to ? state.doc.lineAt(from).text : state.sliceDoc(from, to)
      onRun(sql)
    },
    [onRun]
  )

  const extensions = useMemo(() => {
    const sqlExt = sql({ schema: sqlSchema })
    const exts: Extension[] = [
      sqlExt,
      // 输入 FROM/JOIN 等后自动弹表名（优先于 lang-sql 默认源）
      Prec.highest(sqlExt.language.data.of({ autocomplete: tableCompletionSource(tableNames) }))
    ]
    if (onRun) {
      // Cmd/Ctrl+Enter 执行（Mod-Enter），Prec.highest 防止其他 keymap 抢占
      exts.push(
        Prec.highest(
          keymap.of([
            {
              key: 'Mod-Enter',
              run: view => {
                runFromView(view)
                return true
              }
            }
          ])
        )
      )
    }
    return exts
  }, [sqlSchema, tableNames, onRun, runFromView])

  // 暴露 run()：供按钮执行选区/当前行（与快捷键同一套选区逻辑）
  useImperativeHandle(
    ref,
    () => ({
      run: () => {
        const view = editorRef.current?.view
        if (view) runFromView(view)
      }
    }),
    [runFromView]
  )

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      height={height ?? '200px'}
      extensions={extensions}
      onChange={onChange}
    />
  )
})

export default SqlEditor

/**
 * API 层：向页面/数据层暴露业务函数（内部统一走带 token 的请求封装）。
 * 页面与 hooks 直接调用这里的函数，不直接拼 URL / 操作 fetch。
 */
import type {
  CustomView,
  DatabaseInfo,
  FilterCondition,
  QueryResult,
  RowsResult,
  SortSpec,
  TableInfo,
  TableSchemaEntry
} from '@shared/types'

const REQUEST_TIMEOUT_MS = 30_000

/** 带 token 的请求封装（含超时，避免请求挂起时 UI 一直卡在 loading） */
async function apiFetch<T>(
  pathname: string,
  params: Record<string, string | number> = {},
  init?: RequestInit
): Promise<T> {
  const url = new URL(pathname, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const token = new URLSearchParams(window.location.search).get('t')
  if (token) url.searchParams.set('t', token)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), { signal: controller.signal, ...init })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `请求失败 (${res.status})`)
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请刷新重试', { cause: err })
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 表/视图清单（含字段预取） */
export function fetchTables(): Promise<TableSchemaEntry[]> {
  return apiFetch<TableSchemaEntry[]>('/api/tables')
}

/** 当前数据库信息 + 最近打开列表（主页展示/切换用） */
export function fetchDatabases(): Promise<DatabaseInfo> {
  return apiFetch<DatabaseInfo>('/api/databases')
}

/** 切换数据库（只读打开新库），返回切换后的信息 */
export function switchDatabase(path: string): Promise<DatabaseInfo> {
  return apiFetch<DatabaseInfo>(
    '/api/databases/switch',
    {},
    {
      method: 'POST',
      body: JSON.stringify({ path })
    }
  )
}

/** 单表结构详情（外键/索引/行数） */
export function fetchTableInfo(name: string): Promise<TableInfo> {
  return apiFetch<TableInfo>(`/api/tables/${encodeURIComponent(name)}`)
}

export interface FetchRowsOptions {
  page: number
  pageSize: number
  filters?: FilterCondition[]
  sort?: SortSpec | null
}

/** 只读查询（SQL 控制台） */
export function runQuery(sql: string): Promise<QueryResult> {
  return apiFetch<QueryResult>('/api/query', {}, { method: 'POST', body: JSON.stringify({ sql }) })
}

/** 自定义视图：列表 */
export function fetchViews(): Promise<CustomView[]> {
  return apiFetch<CustomView[]>('/api/views')
}

/** 自定义视图：新建 */
export function createView(name: string, sql: string): Promise<CustomView> {
  return apiFetch<CustomView>(
    '/api/views',
    {},
    {
      method: 'POST',
      body: JSON.stringify({ name, sql })
    }
  )
}

/** 自定义视图：更新 */
export function updateView(
  id: number,
  patch: { name?: string; sql?: string }
): Promise<CustomView> {
  return apiFetch<CustomView>(
    `/api/views/${id}`,
    {},
    {
      method: 'PUT',
      body: JSON.stringify(patch)
    }
  )
}

/** 自定义视图：删除 */
export function deleteView(id: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/views/${id}`, {}, { method: 'DELETE' })
}

/** SQL 编辑器草稿：读取（跨会话保留上次编辑内容） */
export function fetchDraft(): Promise<{ sql: string }> {
  return apiFetch<{ sql: string }>('/api/draft')
}

/** SQL 编辑器草稿：保存 */
export function saveDraft(sql: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    '/api/draft',
    {},
    {
      method: 'PUT',
      body: JSON.stringify({ sql })
    }
  )
}

/** 分页数据（可选按列过滤 / 排序） */
export function fetchRows(name: string, options: FetchRowsOptions): Promise<RowsResult> {
  const params: Record<string, string | number> = { page: options.page, pageSize: options.pageSize }
  if (options.filters && options.filters.length > 0) {
    params.filter = JSON.stringify(options.filters)
  }
  if (options.sort) {
    params.sortBy = options.sort.column
    params.sortDir = options.sort.direction
  }
  return apiFetch<RowsResult>(`/api/tables/${encodeURIComponent(name)}/rows`, params)
}

/** 刷新：清空服务端行数缓存（外部可能改过库） */
export function refreshRowCountCache(): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/api/refresh', {}, { method: 'POST' })
}

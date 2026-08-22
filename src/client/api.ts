/** 带 token 的 API 请求封装（含超时，避免请求挂起时 UI 一直卡在 loading） */

const REQUEST_TIMEOUT_MS = 30_000

export async function apiFetch<T>(
  pathname: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const url = new URL(pathname, window.location.origin)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const token = new URLSearchParams(window.location.search).get('t')
  if (token) url.searchParams.set('t', token)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), { signal: controller.signal })
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

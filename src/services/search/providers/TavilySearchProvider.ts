import type { SearchRequest, SearchResponse, SearchResult } from '../SearchTypes'
import type { WebSearchProvider } from '../WebSearchProvider'

/**
 * Tavily Search Provider
 * https://docs.tavily.com/docs/rest-api/api-reference
 * 免费 1000 次/月，专为 AI 设计，返回干净摘要
 */
export class TavilySearchProvider implements WebSearchProvider {
  name = 'tavily'

  constructor(private apiKey: string, private timeout = 5000) {}

  async search(request: SearchRequest): Promise<SearchResponse> {
    if (!this.apiKey) {
      return { ok: false, results: [], message: 'Tavily API Key 未配置' }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeout)

      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: request.query,
          max_results: request.maxResults ?? 5,
          search_depth: 'basic',
          include_answer: true,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        return { ok: false, results: [], message: `Tavily 错误 (HTTP ${resp.status})：${body.slice(0, 200)}` }
      }

      const data = await resp.json() as {
        results?: { title: string; url: string; content: string; score?: number }[]
        answer?: string
      }

      const results: SearchResult[] = (data.results || []).map((r) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: (r.content || '').slice(0, 500),
        source: safeDomain(r.url),
        score: r.score,
      }))

      return { ok: true, results }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { ok: false, results: [], message: '搜索超时' }
      }
      return { ok: false, results: [], message: `搜索失败：${err?.message || String(err)}` }
    }
  }
}

function safeDomain(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}

import type { SearchRequest, SearchResponse, SearchResult, SearchQuota, SearchConfig } from './SearchTypes'
import type { WebSearchProvider } from './WebSearchProvider'
import { TavilySearchProvider } from './providers/TavilySearchProvider'

/**
 * SearchManager — Provider 选择、结果标准化、配额管理
 */

const QUOTA_FILE = 'search-quota.json'

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export class SearchManager {
  private provider: WebSearchProvider | null = null
  private config: SearchConfig

  constructor(config: SearchConfig) {
    this.config = config
    this.initProvider()
  }

  private initProvider(): void {
    if (!this.config.enabled || !this.config.apiKey) {
      this.provider = null
      return
    }
    switch (this.config.provider) {
      case 'tavily':
        this.provider = new TavilySearchProvider(this.config.apiKey, this.config.timeout)
        break
      // case 'brave':   // V1.5
      // case 'searxng': // V2
      default:
        this.provider = null
    }
  }

  /** 执行搜索（含标准化 + 配额） */
  async search(request: SearchRequest): Promise<SearchResponse> {
    if (!this.provider) {
      return { ok: false, results: [], message: '搜索未启用或 Provider 未配置' }
    }

    // 配额检查
    const quota = await this.getQuota()
    if (quota.used >= quota.limit) {
      return { ok: false, results: [], message: '本月搜索额度已用完', quotaRemaining: 0 }
    }

    const resp = await this.provider.search(request)
    if (!resp.ok) return resp

    // 标准化：去重、排序、截断
    const results = normalizeResults(resp.results)

    // 计数
    await this.incrementQuota()

    return { ok: true, results, quotaRemaining: quota.limit - quota.used - 1 }
  }

  /** 获取配额状态 */
  async getQuota(): Promise<SearchQuota> {
    // 月度重置
    const month = currentMonth()
    if (this.config.quotaMonth !== month) {
      this.config.quotaMonth = month
      this.config.quotaUsed = 0
    }
    return {
      used: this.config.quotaUsed,
      limit: this.config.quotaLimit,
      month: this.config.quotaMonth,
      warning: this.config.quotaLimit - this.config.quotaUsed <= this.config.warnThreshold,
    }
  }

  private async incrementQuota(): Promise<void> {
    this.config.quotaUsed++
  }

  updateConfig(config: SearchConfig): void {
    this.config = config
    this.initProvider()
  }
}

/** 结果标准化：去重、排序、截断、补全 source */
function normalizeResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  const unique: SearchResult[] = []

  for (const r of results) {
    const key = r.url.replace(/\/+$/, '')
    if (seen.has(key)) continue
    seen.add(key)

    unique.push({
      title: r.title.slice(0, 120),
      url: r.url,
      snippet: r.snippet.slice(0, 500),
      source: r.source || safeDomain(r.url),
      score: r.score,
    })
  }

  // 按 score 降序
  unique.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  // 最多 5 条
  return unique.slice(0, 5)
}

function safeDomain(url: string): string {
  try { return new URL(url).hostname } catch { return '' }
}

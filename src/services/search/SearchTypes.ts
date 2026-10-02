/** 搜索请求 */
export interface SearchRequest {
  query: string
  maxResults?: number
  language?: string
  timeRange?: 'day' | 'week' | 'month'
}

/** 单条搜索结果 */
export interface SearchResult {
  title: string
  url: string
  snippet: string
  content?: string
  publishedAt?: string
  source?: string
  score?: number
}

/** 搜索响应 */
export interface SearchResponse {
  ok: boolean
  results: SearchResult[]
  quotaRemaining?: number
  message?: string
}

/** 配额状态 */
export interface SearchQuota {
  used: number
  limit: number
  month: string
  warning: boolean
}

/** 搜索配置 */
export interface SearchConfig {
  enabled: boolean
  provider: 'tavily' | 'brave' | 'searxng'
  apiKey: string
  quotaLimit: number
  quotaUsed: number
  quotaMonth: string
  warnThreshold: number
  timeout: number
}

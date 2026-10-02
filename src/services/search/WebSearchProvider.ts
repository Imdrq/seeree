import type { SearchRequest, SearchResponse } from './SearchTypes'

/** 统一搜索 Provider 接口 — 所有 Provider 实现此接口 */
export interface WebSearchProvider {
  name: string
  search(request: SearchRequest): Promise<SearchResponse>
}

/**
 * Connector 標準介面定義
 */

export interface RawItem {
  // 唯一識別碼 (platform-slug-date 格式)
  id: string

  // 來源資訊
  source_platform: 'github' | 'youtube' | 'twitter' | 'chrome' | 'pocket' | string
  source_type: 'star' | 'bookmark' | 'tweet' | 'video' | 'article' | string
  url: string

  // 內容基本資訊
  title: string
  author?: string
  channel?: string
  description?: string
  content?: string  // 網頁正文（可選）

  // 時間戳記
  collected_at: Date

  // 知識分類
  knowledge_type: 'factual' | 'opinion' | 'personal_value'
  visibility: 'public' | 'private'

  // 標籤（ingest 時由 LLM 填入）
  domains?: string[]
  roles?: Record<string, number>  // { engineer: 0.8, ceo: 0.5 }

  // 附加資訊
  tags?: string[]
  thumbnail?: string
  metadata?: Record<string, unknown>
}

/**
 * Connector 統一介面
 * 所有平台適配器都必須實作這個介面
 */
export interface IConnector {
  // 平台名稱
  readonly name: string

  // 增量同步：只拉取 since 之後的新資料
  // since 為 null 表示首次全量同步
  fetchSince(since: Date | null): Promise<RawItem[]>

  // 將原始項目轉換為標準 Markdown 格式
  toMarkdown(item: RawItem): string

  // 檢查項目是否已存在（去重）
  isDuplicate(item: RawItem, vaultPath: string): Promise<boolean>

  // 可選：驗證連線 (用於檢查 API Key 等)
  validateConnection?(): Promise<void>
}

/**
 * 同步狀態記錄
 */
export interface PlatformSyncState {
  last_sync: string | null  // ISO 8601 格式
  last_cursor?: string | number
  error?: string
}

export interface SyncState {
  [platform: string]: PlatformSyncState
}

/**
 * 知識沉澱結果
 */
export interface IngestResult {
  success: boolean
  message: string
  created_pages?: string[]
  updated_pages?: string[]
  errors?: Array<{ item_id: string; error: string }>
}

/**
 * Wiki 頁面 Frontmatter
 */
export interface WikiFrontmatter {
  title: string
  type: 'concept' | 'entity' | 'synthesis'
  created_at: string
  updated_at: string
  sources: Array<{
    platform: string
    type: string
    url: string
    collected_at: string
  }>
  related_pages?: string[]
  roles?: Record<string, number>
  tags?: string[]
  knowledge_type?: 'factual' | 'opinion' | 'personal_value'
}

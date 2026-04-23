/**
 * Second Brain MCP Server
 * 核心編排層，調用 Connectors、LLM Wiki、Ingest Agent
 */

import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'
import { createGitHubConnector } from './connectors/github'
import { IConnector, RawItem, SyncState, PlatformSyncState } from './types'

// 每次啟動時強制重新加載 .env，確保獲取最新的值
dotenv.config({ override: true })

interface MCPServerConfig {
  vaultPath: string
  connectors: {
    github?: string
    youtube?: string
    twitter?: string
  }
}

export class SecondBrainMCPServer {
  private config: MCPServerConfig
  private connectors: Map<string, IConnector> = new Map()

  constructor(config: MCPServerConfig) {
    this.config = config
    this.initializeConnectors()
  }

  private getSyncStatePath(platform: string): string {
    return path.join(this.config.vaultPath, 'raw', platform, '.sync-state.json')
  }

  private initializeConnectors(): void {
    // GitHub Connector (REST API)
    try {
      const connector = createGitHubConnector()
      this.connectors.set('github', connector)
      console.log('✓ GitHub Connector 初始化成功 (REST API)')
    } catch (error) {
      console.error('✗ GitHub Connector 初始化失敗:', error)
    }

    // TODO: 其他 Connectors (YouTube, Twitter, etc.)
  }

  /**
   * 同步所有已初始化的 Connectors
   */
  async syncAll(): Promise<void> {
    console.log('\n🔄 開始同步...\n')

    for (const [platform, connector] of this.connectors) {
      try {
        const syncState = this.loadSyncState(platform)
        await this.syncPlatform(platform, connector, syncState)
        this.saveSyncState(platform, syncState)
      } catch (error) {
        console.error(`✗ ${platform} 同步失敗:`, error)
      }
    }

    console.log('\n✓ 同步完成！')
  }

  /**
   * 同步單個平台
   */
  private async syncPlatform(
    platform: string,
    connector: IConnector,
    syncState: PlatformSyncState
  ): Promise<void> {
    console.log(`📥 同步 ${platform}...`)

    // 取得上次同步時間
    const lastSync = syncState.last_sync
      ? new Date(syncState.last_sync)
      : null

    // 從 Connector 拉取資料
    const items = await connector.fetchSince(lastSync)
    console.log(`   找到 ${items.length} 筆新資料`)

    if (items.length === 0) {
      console.log(`   沒有新資料`)
      return
    }

    // 存進 vault/raw/{platform}/
    const rawDir = path.join(this.config.vaultPath, 'raw', platform)
    this.ensureDir(rawDir)

    for (const item of items) {
      const filePath = path.join(rawDir, `${item.id}.md`)

      if (await connector.isDuplicate(item, this.config.vaultPath)) {
        console.log(`   跳過已存在: ${item.title}`)
        continue
      }

      const markdown = connector.toMarkdown(item)
      fs.writeFileSync(filePath, markdown, 'utf-8')
      console.log(`   ✓ 存儲: ${item.title}`)
    }

    // 更新同步狀態
    syncState.last_sync = new Date().toISOString()
  }

  /**
   * 從 raw/ 編譯 wiki/
   * (TODO: 調用 LLM Wiki 和 Ingest Agent)
   */
  async ingestRawToWiki(): Promise<void> {
    console.log('\n📚 開始知識沉澱...\n')

    const rawDir = path.join(this.config.vaultPath, 'raw')

    if (!fs.existsSync(rawDir)) {
      console.log('✗ raw/ 資料夾不存在')
      return
    }

    // 掃描 raw/ 底下的所有 .md 檔案
    const platformDirs = fs.readdirSync(rawDir)

    for (const platform of platformDirs) {
      const platformDir = path.join(rawDir, platform)
      const stat = fs.statSync(platformDir)

      if (!stat.isDirectory()) continue

      console.log(`📂 處理 ${platform} 的資料...`)

      const files = fs.readdirSync(platformDir).filter((f) => f.endsWith('.md'))
      console.log(`   共 ${files.length} 筆資料待沉澱`)

      // TODO: 實作 LLM Wiki 編譯邏輯
      // - 解析 frontmatter
      // - 提取概念和實體
      // - 建立 wiki/ 頁面
      // - 更新 wiki/index.md
    }

    console.log('\n✓ 知識沉澱完成！')
  }

  /**
   * 載入同步狀態
   */
  private loadSyncState(platform: string): PlatformSyncState {
    const statePath = this.getSyncStatePath(platform)
    if (fs.existsSync(statePath)) {
      const content = fs.readFileSync(statePath, 'utf-8')
      return JSON.parse(content)
    }
    return { last_sync: null }
  }

  /**
   * 儲存同步狀態
   */
  private saveSyncState(platform: string, state: PlatformSyncState): void {
    const statePath = this.getSyncStatePath(platform)
    this.ensureDir(path.dirname(statePath))
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  /**
   * 確保目錄存在
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * 取得連線狀態
   */
  async checkConnections(): Promise<void> {
    console.log('\n🔗 檢查連線...\n')

    for (const [name, connector] of this.connectors) {
      try {
        if (connector.validateConnection) {
          await connector.validateConnection()
          console.log(`✓ ${name} 連線正常`)
        }
      } catch (error) {
        console.error(`✗ ${name} 連線失敗:`, error)
      }
    }
  }

  /**
   * 清理資源
   */
  async cleanup(): Promise<void> {
    for (const [name, connector] of this.connectors) {
      try {
        if ('close' in connector && typeof (connector as any).close === 'function') {
          await (connector as any).close()
        }
      } catch (error) {
        console.error(`清理 ${name} 資源時出錯:`, error)
      }
    }
  }
}

/**
 * 主函式 - 從 .env 讀取配置並執行同步
 */
async function main() {
  const vaultPath = process.env.VAULT_PATH || './vault'

  const server = new SecondBrainMCPServer({
    vaultPath,
    connectors: {},
  })

  try {
    // 1. 檢查連線
    await server.checkConnections()

    // 2. 同步所有 Connectors
    await server.syncAll()

    // 3. 知識沉澱 (TODO: 實作 LLM 集成)
    await server.ingestRawToWiki()

    console.log('\n✅ 全部完成！')
  } catch (error) {
    console.error('❌ 執行出錯:', error)
    process.exit(1)
  } finally {
    // 清理資源
    await server.cleanup()
  }
}

// 如果直接執行此檔案 (ES Module 方式)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule || process.argv[1]?.includes('mcp-server')) {
  main().catch(console.error)
}

export default SecondBrainMCPServer

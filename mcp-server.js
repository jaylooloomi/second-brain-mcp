/**
 * Second Brain MCP Server
 * 核心編排層，調用 Connectors、LLM Wiki、Ingest Agent
 */

import * as fs from 'fs'
import * as path from 'path'
import dotenv from 'dotenv'
import { createGitHubConnector } from './connectors/github/index.js'
import { createChromeConnector } from './connectors/chrome/index.js'
import { LLMWikiCompiler } from './llm-wiki.js'

// 每次啟動時強制重新加載 .env，確保獲取最新的值
dotenv.config({ override: true })

export class SecondBrainMCPServer {
  constructor(config) {
    this.config = config
    this.connectors = new Map()
    this.initializeConnectors()
  }

  getSyncStatePath(platform) {
    return path.join(this.config.vaultPath, 'raw', platform, '.sync-state.json')
  }

  initializeConnectors() {
    // GitHub Connector (OAuth via gh CLI，預設)
    try {
      const connector = createGitHubConnector(this.config.vaultPath)
      this.connectors.set('github', connector)
      console.log('✓ GitHub Connector 初始化成功 (OAuth)')
    } catch (error) {
      console.error('✗ GitHub Connector 初始化失敗:', error)
    }

    // Chrome 書籤 Connector
    try {
      const connector = createChromeConnector()
      this.connectors.set('chrome', connector)
      console.log('✓ Chrome Connector 初始化成功')
    } catch (error) {
      console.error('✗ Chrome Connector 初始化失敗:', error)
    }

    // TODO: 其他 Connectors (YouTube, Twitter, etc.)
  }

  /**
   * 同步所有已初始化的 Connectors
   */
  async syncAll() {
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
  async syncPlatform(platform, connector, syncState) {
    console.log(`📥 同步 ${platform}...`)

    // 取得上次同步時間
    const lastSync = syncState.last_sync
      ? new Date(syncState.last_sync)
      : null

    // 存進 vault/raw/{platform}/
    const rawDir = path.join(this.config.vaultPath, 'raw', platform)
    this.ensureDir(rawDir)

    let savedCount = 0

    // 每抓到一筆就立刻存檔（支援中途中斷後重跑）
    const saveItem = async (item) => {
      if (await connector.isDuplicate(item, this.config.vaultPath)) {
        return
      }
      const filePath = path.join(rawDir, `${item.id}.md`)
      const markdown = connector.toMarkdown(item)
      fs.writeFileSync(filePath, markdown, 'utf-8')
      savedCount++
    }

    if (connector.supportsStreaming) {
      // 抓一個、存一個
      await connector.fetchSince(lastSync, saveItem)
    } else {
      // 一般模式（GitHub 等小量資料）
      const items = await connector.fetchSince(lastSync)
      for (const item of items) await saveItem(item)
    }

    console.log(`   共存入 ${savedCount} 筆`)

    // 更新同步狀態
    syncState.last_sync = new Date().toISOString()
  }

  /**
   * 從 raw/ 編譯 wiki/
   * (TODO: 調用 LLM Wiki 和 Ingest Agent)
   */
  async ingestRawToWiki() {
    console.log('\n📚 開始知識沉澱...\n')

    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  未設置 ANTHROPIC_API_KEY，跳過知識沉澱')
      return
    }

    const rawDir = path.join(this.config.vaultPath, 'raw')
    if (!fs.existsSync(rawDir)) {
      console.log('✗ raw/ 資料夾不存在')
      return
    }

    const compiler = new LLMWikiCompiler(this.config.vaultPath)
    const platformDirs = fs.readdirSync(rawDir)

    for (const platform of platformDirs) {
      const platformDir = path.join(rawDir, platform)
      if (!fs.statSync(platformDir).isDirectory()) continue

      const files = fs.readdirSync(platformDir).filter(f => f.endsWith('.md') && !f.startsWith('.'))
      console.log(`📂 處理 ${platform}（共 ${files.length} 筆）...`)

      await compiler.compileAll(platform)
    }

    console.log('\n✓ 知識沉澱完成！')
  }

  /**
   * 載入同步狀態
   */
  loadSyncState(platform) {
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
  saveSyncState(platform, state) {
    const statePath = this.getSyncStatePath(platform)
    this.ensureDir(path.dirname(statePath))
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
  }

  /**
   * 確保目錄存在
   */
  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * 取得連線狀態
   */
  async checkConnections() {
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
  async cleanup() {
    for (const [name, connector] of this.connectors) {
      try {
        if ('close' in connector && typeof connector.close === 'function') {
          await connector.close()
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

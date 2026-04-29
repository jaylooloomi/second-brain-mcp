/**
 * Second Brain MCP Server
 * Claude Desktop 透過此 MCP Server 直接操作 Vault
 *
 * 工具清單：
 *   vault_stats       — Vault 統計
 *   vault_list_raw    — 列出 raw 檔案
 *   vault_read_raw    — 讀取 raw 檔案內容
 *   vault_list_wiki   — 列出 wiki 頁面
 *   vault_read_wiki   — 讀取 wiki 頁面
 *   vault_write_wiki  — 寫入 wiki 頁面
 *   vault_search      — 搜尋 vault 內容
 *   sync_now          — 觸發同步
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import dotenv from 'dotenv'

dotenv.config({ override: true })

const VAULT_PATH = process.env.VAULT_PATH || './vault'
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

const server = new McpServer({
  name: 'second-brain-mcp-server',
  version: '1.0.0',
})

// ─── 工具 1: vault_stats ──────────────────────────────────────────────────────

server.registerTool(
  'vault_stats',
  {
    title: 'Vault Statistics',
    description: 'Get statistics about the vault: how many raw files per platform, how many wiki pages.',
    inputSchema: {},
  },
  async () => {
    const stats = { raw: {}, wiki: {}, total_raw: 0, total_wiki: 0 }

    const rawDir = path.join(VAULT_PATH, 'raw')
    if (fs.existsSync(rawDir)) {
      for (const platform of fs.readdirSync(rawDir)) {
        const platformDir = path.join(rawDir, platform)
        if (!fs.statSync(platformDir).isDirectory()) continue
        const count = fs.readdirSync(platformDir).filter(
          (f) => f.endsWith('.md') && !f.startsWith('.')
        ).length
        stats.raw[platform] = count
        stats.total_raw += count
      }
    }

    const wikiDir = path.join(VAULT_PATH, 'wiki')
    if (fs.existsSync(wikiDir)) {
      for (const subdir of ['concepts', 'entities', 'syntheses']) {
        const subdirPath = path.join(wikiDir, subdir)
        if (!fs.existsSync(subdirPath)) continue
        const count = fs.readdirSync(subdirPath).filter((f) => f.endsWith('.md')).length
        stats.wiki[subdir] = count
        stats.total_wiki += count
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      structuredContent: stats,
    }
  }
)

// ─── 工具 2: vault_list_raw ───────────────────────────────────────────────────

server.registerTool(
  'vault_list_raw',
  {
    title: 'List Raw Items',
    description:
      'List raw items in vault/raw/. Returns id, platform, title, url for each item. ' +
      'Use platform parameter to filter (github, chrome, youtube, etc.)',
    inputSchema: {
      platform: z
        .string()
        .optional()
        .describe('Filter by platform (github, chrome, etc.). Omit to list all.'),
      limit: z
        .number()
        .optional()
        .default(100)
        .describe('Max items to return per platform (default 100)'),
      offset: z.number().optional().default(0).describe('Skip first N items (for pagination)'),
    },
  },
  async ({ platform, limit = 100, offset = 0 }) => {
    const rawDir = path.join(VAULT_PATH, 'raw')
    const results = []

    const platforms = platform
      ? [platform]
      : fs.existsSync(rawDir)
        ? fs.readdirSync(rawDir).filter((p) => fs.statSync(path.join(rawDir, p)).isDirectory())
        : []

    for (const p of platforms) {
      const platformDir = path.join(rawDir, p)
      if (!fs.existsSync(platformDir)) continue

      const files = fs
        .readdirSync(platformDir)
        .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
        .slice(offset, offset + limit)

      for (const file of files) {
        const content = fs.readFileSync(path.join(platformDir, file), 'utf-8')
        const titleMatch = content.match(/^title: (.+)$/m)
        const urlMatch = content.match(/^url: (.+)$/m)
        const collectedMatch = content.match(/^collected_at: (.+)$/m)
        results.push({
          id: file.replace('.md', ''),
          platform: p,
          title: titleMatch ? titleMatch[1].trim() : file,
          url: urlMatch ? urlMatch[1].trim() : '',
          collected_at: collectedMatch ? collectedMatch[1].trim() : '',
        })
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: { items: results, total: results.length },
    }
  }
)

// ─── 工具 3: vault_read_raw ───────────────────────────────────────────────────

server.registerTool(
  'vault_read_raw',
  {
    title: 'Read Raw Item',
    description: 'Read the full content of a raw item by platform and file ID.',
    inputSchema: {
      platform: z.string().describe('Platform name (github, chrome, etc.)'),
      id: z.string().describe('File ID — the filename without .md extension'),
    },
  },
  async ({ platform, id }) => {
    const filePath = path.join(VAULT_PATH, 'raw', platform, `${id}.md`)
    if (!fs.existsSync(filePath)) {
      return {
        content: [{ type: 'text', text: `Error: File not found — ${filePath}` }],
        isError: true,
      }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { content: [{ type: 'text', text: content }] }
  }
)

// ─── 工具 4: vault_list_wiki ──────────────────────────────────────────────────

server.registerTool(
  'vault_list_wiki',
  {
    title: 'List Wiki Pages',
    description: 'List all wiki pages in vault/wiki/. Optionally filter by subdirectory.',
    inputSchema: {
      subdir: z
        .string()
        .optional()
        .describe('Subdirectory to list (concepts, entities, syntheses). Omit for all.'),
    },
  },
  async ({ subdir }) => {
    const wikiDir = path.join(VAULT_PATH, 'wiki')
    if (!fs.existsSync(wikiDir)) {
      return {
        content: [{ type: 'text', text: '[]' }],
        structuredContent: { pages: [], total: 0 },
      }
    }

    const results = []
    const dirs = subdir ? [subdir] : ['concepts', 'entities', 'syntheses']

    for (const dir of dirs) {
      const dirPath = path.join(wikiDir, dir)
      if (!fs.existsSync(dirPath)) continue
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'))
      for (const file of files) {
        results.push({ path: `${dir}/${file}`, name: file.replace('.md', '') })
      }
    }

    const indexPath = path.join(wikiDir, 'index.md')
    if (fs.existsSync(indexPath)) {
      results.unshift({ path: 'index.md', name: 'index' })
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: { pages: results, total: results.length },
    }
  }
)

// ─── 工具 5: vault_read_wiki ──────────────────────────────────────────────────

server.registerTool(
  'vault_read_wiki',
  {
    title: 'Read Wiki Page',
    description: 'Read the content of a wiki page.',
    inputSchema: {
      page_path: z
        .string()
        .describe('Path relative to vault/wiki/ — e.g. "concepts/MCP.md" or "index.md"'),
    },
  },
  async ({ page_path }) => {
    const filePath = path.join(VAULT_PATH, 'wiki', page_path)
    if (!fs.existsSync(filePath)) {
      return {
        content: [{ type: 'text', text: `Wiki page not found: ${page_path}` }],
        isError: true,
      }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { content: [{ type: 'text', text: content }] }
  }
)

// ─── 工具 6: vault_write_wiki ─────────────────────────────────────────────────

server.registerTool(
  'vault_write_wiki',
  {
    title: 'Write Wiki Page',
    description:
      'Create or update a wiki page in vault/wiki/. ' +
      'Use this to save LLM-generated knowledge pages after analyzing raw items.',
    inputSchema: {
      page_path: z
        .string()
        .describe('Path relative to vault/wiki/ — e.g. "concepts/MCP.md"'),
      content: z.string().describe('Full markdown content including YAML frontmatter'),
    },
  },
  async ({ page_path, content }) => {
    const filePath = path.join(VAULT_PATH, 'wiki', page_path)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    fs.writeFileSync(filePath, content, 'utf-8')
    return { content: [{ type: 'text', text: `✓ Saved: vault/wiki/${page_path}` }] }
  }
)

// ─── 工具 7: vault_search ─────────────────────────────────────────────────────

server.registerTool(
  'vault_search',
  {
    title: 'Search Vault',
    description: 'Search for a keyword across all raw items. Returns matching file IDs and context snippets.',
    inputSchema: {
      query: z.string().describe('Keyword or phrase to search for'),
      platform: z
        .string()
        .optional()
        .describe('Limit search to specific platform (github, chrome, etc.)'),
      limit: z.number().optional().default(20).describe('Max results (default 20)'),
    },
  },
  async ({ query, platform, limit = 20 }) => {
    const rawDir = path.join(VAULT_PATH, 'raw')
    const results = []
    const lowerQuery = query.toLowerCase()

    const platforms = platform
      ? [platform]
      : fs.existsSync(rawDir)
        ? fs.readdirSync(rawDir).filter((p) => fs.statSync(path.join(rawDir, p)).isDirectory())
        : []

    outer: for (const p of platforms) {
      const platformDir = path.join(rawDir, p)
      if (!fs.existsSync(platformDir)) continue

      const files = fs
        .readdirSync(platformDir)
        .filter((f) => f.endsWith('.md') && !f.startsWith('.'))

      for (const file of files) {
        if (results.length >= limit) break outer
        const content = fs.readFileSync(path.join(platformDir, file), 'utf-8')
        if (content.toLowerCase().includes(lowerQuery)) {
          const idx = content.toLowerCase().indexOf(lowerQuery)
          const snippet = content
            .slice(Math.max(0, idx - 80), idx + 200)
            .replace(/\n+/g, ' ')
            .trim()
          const titleMatch = content.match(/^title: (.+)$/m)
          results.push({
            id: file.replace('.md', ''),
            platform: p,
            title: titleMatch ? titleMatch[1].trim() : file,
            snippet,
          })
        }
      }
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      structuredContent: { results, total: results.length, query },
    }
  }
)

// ─── 工具 8: sync_now ─────────────────────────────────────────────────────────

server.registerTool(
  'sync_now',
  {
    title: 'Sync Now',
    description: 'Trigger a sync for a specific platform to fetch latest data into vault/raw/.',
    inputSchema: {
      platform: z.enum(['github', 'chrome']).describe('Platform to sync'),
    },
  },
  async ({ platform }) => {
    const { SecondBrainMCPServer } = await import('./mcp-server.js')
    const syncServer = new SecondBrainMCPServer({ vaultPath: VAULT_PATH })
    const connector = syncServer.connectors.get(platform)

    if (!connector) {
      return {
        content: [{ type: 'text', text: `Unknown platform: ${platform}` }],
        isError: true,
      }
    }

    const syncState = syncServer.loadSyncState(platform)
    await syncServer.syncPlatform(platform, connector, syncState)
    syncServer.saveSyncState(platform, syncState)

    return { content: [{ type: 'text', text: `✓ ${platform} sync complete` }] }
  }
)

// ─── 啟動 ──────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)

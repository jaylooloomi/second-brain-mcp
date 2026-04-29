/**
 * Chrome 書籤 Connector
 * 讀取本地 Chrome Bookmarks JSON，抓取每個 URL 的正文，轉成 Markdown
 * 核心技術：@mozilla/readability（正文萃取）+ turndown（HTML → Markdown）
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as url from 'url'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

const DEFAULT_BOOKMARKS_PATH = path.join(
  os.homedir(),
  'AppData/Local/Google/Chrome/User Data/Default/Bookmarks'
)

// Chrome 的 date_added 是 Windows FILETIME：從 1601-01-01 起算的微秒數
// 換算成 JS Date：先轉毫秒，再減掉 1601→1970 的差值
function chromeTimeToDate(chromeTime) {
  const ms = Math.floor(parseInt(chromeTime) / 1000) - 11644473600000
  return new Date(ms)
}

// 只處理可以 fetch 的 URL，跳過 chrome://、file://、localhost 等
function isFetchable(rawUrl) {
  try {
    const parsed = new url.URL(rawUrl)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.hostname.includes('localhost') &&
      !parsed.hostname.includes('127.0.0.1') &&
      !parsed.hostname.includes('192.168.')
    )
  } catch {
    return false
  }
}

export class ChromeConnector {
  constructor(bookmarksPath = DEFAULT_BOOKMARKS_PATH) {
    this.name = 'chrome'
    this.bookmarksPath = bookmarksPath
    this.supportsStreaming = true  // 支援 onItem callback，抓一個存一個
  }

  // 遞迴拉出所有書籤，記錄所屬資料夾路徑
  collectBookmarks(node, folderPath = '') {
    const results = []
    if (node.type === 'url') {
      results.push({
        name: node.name,
        url: node.url,
        date_added: chromeTimeToDate(node.date_added),
        folder: folderPath,
      })
    }
    if (node.children) {
      const childFolder = folderPath ? `${folderPath}/${node.name}` : node.name
      for (const child of node.children) {
        results.push(...this.collectBookmarks(child, childFolder))
      }
    }
    return results
  }

  // 核心：fetch URL → Readability 萃取正文 → Turndown 轉 Markdown
  async url2markdown(rawUrl) {
    const response = await fetch(rawUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('html')) throw new Error('非 HTML 頁面')

    const html = await response.text()
    const dom = new JSDOM(html, { url: rawUrl })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article) throw new Error('Readability 無法解析')

    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
    td.use(gfm)

    // 過濾 base64 內嵌圖片 和 無 alt 文字的裝飾圖片
    td.addRule('removeImages', {
      filter: (node) => {
        if (node.nodeName !== 'IMG') return false
        const src = node.getAttribute('src') || ''
        return src.startsWith('data:') || src === ''
      },
      replacement: () => '',
    })

    const markdown = td.turndown(article.content)

    return {
      title: article.title || '',
      excerpt: article.excerpt || '',
      content: markdown.slice(0, 10000), // 截斷避免單檔過大
    }
  }

  async fetchSince(since, onItem = null) {
    const data = JSON.parse(fs.readFileSync(this.bookmarksPath, 'utf-8'))

    // 收集所有書籤
    let all = []
    for (const root of Object.values(data.roots)) {
      all.push(...this.collectBookmarks(root))
    }

    // 只取可 fetch 的 URL
    all = all.filter((b) => isFetchable(b.url))

    // 增量同步：只處理 since 之後加入的書籤
    if (since) {
      all = all.filter((b) => b.date_added > since)
    }

    console.log(`   找到 ${all.length} 個書籤待處理`)

    const items = []
    for (const bookmark of all) {
      try {
        const { title, excerpt, content } = await this.url2markdown(bookmark.url)
        const item = this.toRawItem(bookmark, title || bookmark.name, content, excerpt)

        if (onItem) {
          // streaming 模式：抓一個立刻交給 mcp-server 存一個
          await onItem(item)
        } else {
          items.push(item)
        }

        console.log(`   ✓ ${bookmark.name.slice(0, 50)}`)
        await new Promise((r) => setTimeout(r, 300))
      } catch (err) {
        console.log(`   ✗ 跳過: ${bookmark.name.slice(0, 40)} — ${err.message}`)
      }
    }

    return items  // streaming 模式下為空陣列
  }

  toRawItem(bookmark, title, content, excerpt) {
    const date = new Date().toISOString().split('T')[0]
    const hostname = (() => {
      try { return new url.URL(bookmark.url).hostname } catch { return 'unknown' }
    })()
    const slug = hostname.replace(/\./g, '-')
    const nameSlug = bookmark.name.replace(/[^a-zA-Z0-9一-鿿]/g, '-').slice(0, 40)

    return {
      id: `chrome-${slug}-${nameSlug}-${date}`,
      source_platform: 'chrome',
      source_type: 'bookmark',
      url: bookmark.url,
      title: title || bookmark.name,
      author: hostname,
      description: content,
      excerpt,
      collected_at: new Date(),
      knowledge_type: 'factual',
      visibility: 'private',
      tags: bookmark.folder ? bookmark.folder.split('/').filter(Boolean) : [],
      metadata: {
        folder: bookmark.folder || '',
        bookmarked_at: bookmark.date_added.toISOString(),
      },
    }
  }

  toMarkdown(item) {
    const tags = item.tags?.map((t) => `- ${t}`).join('\n') || '(無)'
    return `---
id: ${item.id}
source_platform: ${item.source_platform}
source_type: ${item.source_type}
url: ${item.url}
title: ${item.title}
author: ${item.author}
collected_at: ${item.collected_at.toISOString()}
bookmarked_at: ${item.metadata.bookmarked_at}
folder: "${item.metadata.folder}"
knowledge_type: ${item.knowledge_type}
visibility: ${item.visibility}
domains: []
roles: {}
---

# ${item.title}

**來源**: [${item.author}](${item.url})
**書籤資料夾**: ${item.metadata.folder || 'N/A'}

## 摘要

${item.excerpt || '*(無摘要)*'}

## 內容

${item.description || '*(無法取得內容)*'}

---

*自動收集自 Chrome 書籤*
`
  }

  async isDuplicate(item, vaultPath) {
    // 第一次呼叫時，掃描所有現有檔案建立 URL 快取
    if (!this._knownUrls) {
      this._knownUrls = new Set()
      const rawDir = path.join(vaultPath, 'raw', 'chrome')
      if (fs.existsSync(rawDir)) {
        const files = fs.readdirSync(rawDir).filter(f => f.endsWith('.md') && !f.startsWith('.'))
        for (const file of files) {
          const content = fs.readFileSync(path.join(rawDir, file), 'utf-8')
          const match = content.match(/^url: (.+)$/m)
          if (match) this._knownUrls.add(match[1].trim())
        }
      }
    }
    if (this._knownUrls.has(item.url)) return true
    this._knownUrls.add(item.url) // 同一次執行內也防重複
    return false
  }

  async validateConnection() {
    if (!fs.existsSync(this.bookmarksPath)) {
      throw new Error(`找不到 Chrome 書籤檔案: ${this.bookmarksPath}`)
    }
    const data = JSON.parse(fs.readFileSync(this.bookmarksPath, 'utf-8'))
    let all = []
    for (const root of Object.values(data.roots)) {
      all.push(...this.collectBookmarks(root))
    }
    const fetchable = all.filter((b) => isFetchable(b.url))
    console.log(`✓ Chrome 書籤驗證成功 (共 ${all.length} 個，可抓取 ${fetchable.length} 個)`)
  }

  async close() {}
}

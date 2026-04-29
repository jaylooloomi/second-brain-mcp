/**
 * GitHub Connector
 * 使用 Device Flow OAuth，token 存於 vault/raw/github/.oauth-session.json
 */

import { GitHubCLIAuth } from './cli.js'
import * as fs from 'fs'
import * as path from 'path'

const GH_HEADERS = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
})

export class OAuthConnector {
  constructor(vaultPath = './vault') {
    this.name = 'github'
    this.auth = new GitHubCLIAuth(vaultPath)
  }

  async getToken() {
    return await this.auth.getToken()
  }

  async validateConnection() {
    try {
      const token = await this.getToken()
      const response = await fetch('https://api.github.com/user', {
        headers: GH_HEADERS(token),
      })
      if (!response.ok) throw new Error(`API 返回 ${response.status}`)

      const user = await response.json()
      const res2 = await fetch('https://api.github.com/user/starred?per_page=1', {
        headers: GH_HEADERS(token),
      })
      const link = res2.headers.get('link')
      const totalMatch = link?.match(/page=(\d+)>; rel="last"/)
      const total = totalMatch ? parseInt(totalMatch[1]) : (link ? 1 : 0)
      console.log(`✓ GitHub 連線驗證成功 (用戶: ${user.login}, 共 ${total} 個 stars)`)
    } catch (error) {
      throw new Error(`GitHub 連線驗證失敗: ${error}`)
    }
  }

  async fetchSince(since) {
    const token = await this.getToken()
    const allRepos = []
    let page = 1
    const perPage = 100

    try {
      const userRes = await fetch('https://api.github.com/user', { headers: GH_HEADERS(token) })
      const currentUser = await userRes.json()
      const me = currentUser.login

      console.log(`📥 正在獲取 GitHub Stars (排除自己的 repos: ${me})...`)

      while (true) {
        const res = await fetch(
          `https://api.github.com/user/starred?per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
          { headers: GH_HEADERS(token) }
        )
        if (!res.ok) throw new Error(`API 返回 ${res.status}: ${res.statusText}`)

        const repos = await res.json()
        if (repos.length === 0) break

        const filtered = repos.filter((r) => {
          const owner = typeof r.owner === 'string' ? r.owner : r.owner?.login
          return owner !== me
        })

        console.log(`   第 ${page} 頁: ${repos.length} 個 (排除 ${repos.length - filtered.length} 個自己的)`)
        allRepos.push(...filtered)

        if (repos.length < perPage) break
        page++
      }

      console.log(`   總共找到 ${allRepos.length} 個 Stars`)

      const items = await Promise.all(
        allRepos.map(async (repo) => {
          const item = this.toRawItem(repo)
          try {
            const readmeRes = await fetch(
              `https://api.github.com/repos/${repo.full_name}/readme`,
              { headers: { ...GH_HEADERS(token), 'Accept': 'application/vnd.github.raw' } }
            )
            if (readmeRes.ok) {
              item.description = await readmeRes.text()
              console.log(`   ✓ README: ${repo.name}`)
            }
          } catch { /* 無 README 跳過 */ }
          return item
        })
      )

      return since ? items.filter(item => new Date(item.collected_at) > since) : items
    } catch (error) {
      throw new Error(`獲取 GitHub Stars 失敗: ${error}`)
    }
  }

  toMarkdown(item) {
    return `---
id: ${item.id}
source_platform: ${item.source_platform}
source_type: ${item.source_type}
url: ${item.url}
title: ${item.title}
author: ${item.author || 'N/A'}
collected_at: ${item.collected_at.toISOString()}
knowledge_type: ${item.knowledge_type}
visibility: ${item.visibility}
domains: []
roles: {}
---

# ${item.title}

**Repository**: [${item.author}/${item.title}](${item.url})

## 詳情

- **作者**: ${item.author}
- **Stars**: ${item.metadata?.stargazers_count || 0}
- **語言**: ${item.metadata?.language || 'N/A'}
- **首頁**: ${item.metadata?.homepage ? `[${item.metadata.homepage}](${item.metadata.homepage})` : 'N/A'}

## 標籤

${item.tags?.map((tag) => `- ${tag}`).join('\n') || '(無標籤)'}

---

## README

${item.description || '*(無 README 內容)*'}

---

*自動收集自 GitHub Starred Repositories*
`
  }

  async isDuplicate(item, vaultPath) {
    // 第一次呼叫時，掃描所有現有檔案建立 URL 快取
    if (!this._knownUrls) {
      this._knownUrls = new Set()
      const rawDir = path.join(vaultPath, 'raw', 'github')
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

  async close() {}

  toRawItem(repo) {
    const date = new Date().toISOString().split('T')[0]
    const owner = typeof repo.owner === 'string' ? repo.owner : repo.owner?.login || 'unknown'
    return {
      id: `github-${owner}-${repo.name}-${date}`,
      source_platform: 'github',
      source_type: 'star',
      url: repo.html_url || repo.url,
      title: repo.name,
      author: owner,
      description: repo.description || undefined,
      collected_at: new Date(),
      knowledge_type: 'factual',
      visibility: 'public',
      tags: repo.topics || [],
      metadata: {
        stargazers_count: repo.stargazers_count,
        language: repo.language,
        homepage: repo.homepage || null,
        created_at: repo.created_at || new Date().toISOString(),
        updated_at: repo.updated_at || new Date().toISOString(),
      },
    }
  }
}

export function createOAuthConnector(vaultPath) {
  return new OAuthConnector(vaultPath)
}

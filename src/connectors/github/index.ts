/**
 * GitHub Stars Connector (REST API)
 * 使用官方 REST API 自動收集 starred repositories
 */

import { IConnector, RawItem } from '../../types'
import dotenv from 'dotenv'

// 強制重新加載 .env
dotenv.config({ override: true })

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  url: string
  description: string | null
  homepage: string | null
  html_url: string
  stargazers_count: number
  language: string | null
  topics: string[]
  owner: {
    login: string
    avatar_url: string
  }
}

export class GitHubConnector implements IConnector {
  readonly name = 'github'

  constructor() {
    // 驗證 token 存在
    const token = process.env.GITHUB_TOKEN || ''
    if (!token) {
      throw new Error('GITHUB_TOKEN 環境變數未設置')
    }
  }

  private getToken(): string {
    // 每次執行時重新讀取 token
    dotenv.config({ override: true })
    const token = process.env.GITHUB_TOKEN || ''
    if (!token) {
      throw new Error('GITHUB_TOKEN 環境變數未設置')
    }
    return token
  }

  async validateConnection(): Promise<void> {
    try {
      const token = this.getToken()
      const response = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })

      if (!response.ok) {
        throw new Error(`API 返回 ${response.status}: ${response.statusText}`)
      }

      const user = (await response.json()) as any
      const response2 = await fetch('https://api.github.com/user/starred?per_page=1', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      const link = response2.headers.get('link')
      const totalMatch = link?.match(/page=(\d+)>; rel="last"/)
      const totalPages = totalMatch ? parseInt(totalMatch[1]) : 1
      const totalRepos = (totalPages - 1) * 1 + (link ? 1 : 0)

      console.log(`✓ GitHub 連線驗證成功 (用戶: ${user.login}, 共 ${totalRepos} 個 stars)`)
    } catch (error) {
      throw new Error(`GitHub 連線驗證失敗: ${error}`)
    }
  }

  async fetchSince(since: Date | null): Promise<RawItem[]> {
    const token = this.getToken()
    const allRepos: GitHubRepo[] = []
    let page = 1
    const perPage = 100

    try {
      // 獲取當前用戶信息
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      const currentUser = (await userResponse.json()) as any
      const currentUsername = currentUser.login

      console.log(`📥 正在獲取 GitHub Stars (排除自己的 repos: ${currentUsername})...`)

      while (true) {
        const response = await fetch(
          `https://api.github.com/user/starred?per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
          }
        )

        if (!response.ok) {
          throw new Error(`API 返回 ${response.status}: ${response.statusText}`)
        }

        const repos = (await response.json()) as any[]
        console.log(`   API 第 ${page} 頁回應: ${repos.length} 個 repos (原始 JSON 長度: ${JSON.stringify(repos).length})`)

        if (repos.length === 0) {
          console.log(`   已抵達最後一頁`)
          break
        }

        // 排除自己的 repos
        const filteredRepos = repos.filter((repo: any) => {
          const owner = typeof repo.owner === 'string' ? repo.owner : repo.owner?.login
          return owner !== currentUsername
        })

        console.log(`   第 ${page} 頁: 找到 ${repos.length} 個 repos (排除 ${repos.length - filteredRepos.length} 個自己的)`)
        allRepos.push(...filteredRepos)

        // 如果返回結果少於 per_page，表示這是最後一頁
        if (repos.length < perPage) {
          break
        }

        page++
      }

      console.log(`   總共找到 ${allRepos.length} 個 Stars`)

      // 轉換為 RawItem 並獲取 README
      const items = await Promise.all(
        allRepos.map(async (repo: any) => {
          const item = this.toRawItem(repo)
          try {
            // 獲取 README 內容
            const readmeResponse = await fetch(
              `https://api.github.com/repos/${repo.full_name}/readme`,
              {
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Accept': 'application/vnd.github.raw',
                  'X-GitHub-Api-Version': '2022-11-28',
                },
              }
            )

            if (readmeResponse.ok) {
              const readmeContent = await readmeResponse.text()
              item.description = readmeContent
              console.log(`   ✓ 讀取 README: ${repo.name}`)
            }
          } catch (e) {
            // README 不存在或讀取失敗，保留原有描述
          }
          return item
        })
      )

      // 如果指定了 since，過濾更早的項目
      if (since) {
        return items.filter((item) => new Date(item.collected_at) > since)
      }

      return items
    } catch (error) {
      throw new Error(`獲取 GitHub Stars 失敗: ${error}`)
    }
  }


  toMarkdown(item: RawItem): string {
    const frontmatter = `---
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
- **更新時間**: ${item.collected_at.toISOString()}
- **首頁**: ${item.metadata?.homepage ? `[${item.metadata.homepage}](${item.metadata.homepage})` : 'N/A'}

## 標籤

${item.tags?.map((tag: string) => `- ${tag}`).join('\n') || '(無標籤)'}

---

## README

${item.description || '*(無 README 內容)*'}

---

## 相關資源

- GitHub 連結: ${item.url}
- 作者: https://github.com/${item.author}

*自動收集自 GitHub Starred Repositories*
`
    return frontmatter
  }

  async isDuplicate(item: RawItem, vaultPath: string): Promise<boolean> {
    // TODO: 實作檢查 vault/raw/github/ 中是否已存在相同 id 的檔案
    return false
  }

  private toRawItem(repo: any): RawItem {
    const date = new Date().toISOString().split('T')[0]
    const owner = typeof repo.owner === 'string' ? repo.owner : repo.owner?.login || 'unknown'
    const id = `github-${owner}-${repo.name}-${date}`

    return {
      id,
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

  /**
   * 清理資源
   */
  async close(): Promise<void> {
    // REST API 不需要清理資源
  }
}

// 導出工廠函數
export function createGitHubConnector(): GitHubConnector {
  return new GitHubConnector()
}

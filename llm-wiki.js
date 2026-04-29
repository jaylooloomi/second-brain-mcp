/**
 * LLM Wiki 編譯器
 * 讀取 vault/raw/ 的原始資料，透過 Claude API 分析，產生 vault/wiki/ 知識頁面
 */

import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const MAX_README_CHARS = 6000

/**
 * 解析 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return { meta: {}, body: content }

  const meta = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key) meta[key] = value
  }

  return { meta, body: content.slice(match[0].length) }
}

/**
 * 從 raw 頁面 body 提取 Stars、語言、README
 */
function parseBody(body) {
  const starsMatch = body.match(/\*\*Stars\*\*:\s*(\d+)/)
  const langMatch = body.match(/\*\*語言\*\*:\s*(.+)/)
  const readmeMatch = body.match(/## README\n\n([\s\S]*)$/)

  return {
    stars: starsMatch ? starsMatch[1] : '0',
    language: langMatch ? langMatch[1].trim() : 'N/A',
    readme: readmeMatch ? readmeMatch[1].trim() : '',
  }
}

export class LLMWikiCompiler {
  constructor(vaultPath) {
    this.vaultPath = vaultPath
    this.client = new Anthropic()
  }

  getWikiPath(platform, rawFileName) {
    return path.join(this.vaultPath, 'wiki', platform, rawFileName)
  }

  isUpToDate(rawPath, wikiPath) {
    if (!fs.existsSync(wikiPath)) return false
    const rawMtime = fs.statSync(rawPath).mtime
    const wikiMtime = fs.statSync(wikiPath).mtime
    return wikiMtime > rawMtime
  }

  async compileItem(platform, rawFileName) {
    const rawPath = path.join(this.vaultPath, 'raw', platform, rawFileName)
    const wikiPath = this.getWikiPath(platform, rawFileName)

    // 已是最新，跳過
    if (this.isUpToDate(rawPath, wikiPath)) {
      return { skipped: true }
    }

    const rawContent = fs.readFileSync(rawPath, 'utf-8')
    const { meta, body } = parseFrontmatter(rawContent)
    const { stars, language, readme } = parseBody(body)

    // 截斷過長的 README
    const truncatedReadme = readme.length > MAX_README_CHARS
      ? readme.slice(0, MAX_README_CHARS) + '\n\n...(內容已截斷)'
      : readme

    // 呼叫 Claude API
    const response = await this.client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `分析這個 GitHub repository，用繁體中文輸出 JSON。

名稱: ${meta.title}
作者: ${meta.author}
語言: ${language}
Stars: ${stars}
標籤: ${meta.tags || '無'}

README:
${truncatedReadme || '（無 README）'}

輸出格式（只輸出 JSON，不要其他文字）:
{
  "oneLiner": "一句話說明這個工具是什麼（20字內）",
  "summary": "2-3句話的功能摘要",
  "coretech": ["技術1", "技術2", "技術3"],
  "usecases": ["場景1", "場景2"],
  "domains": ["域1"],
  "insight": "值得注意的特點或趨勢（1-2句）"
}

domains 從以下選擇（可多選）: AI/ML、前端、後端、DevOps、工具、資料分析、安全、學習資源、其他`
      }]
    })

    // 解析 JSON
    let analysis
    try {
      const text = response.content[0].text
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      analysis = JSON.parse(jsonMatch[0])
    } catch {
      return { error: true, title: meta.title }
    }

    // 確保 wiki 目錄存在
    const wikiDir = path.dirname(wikiPath)
    if (!fs.existsSync(wikiDir)) fs.mkdirSync(wikiDir, { recursive: true })

    // 寫入 wiki 頁面
    fs.writeFileSync(wikiPath, this.generateWikiPage(meta, analysis, { stars, language }, rawFileName), 'utf-8')
    return { success: true, title: meta.title }
  }

  generateWikiPage(meta, analysis, details, rawFileName) {
    const now = new Date().toISOString()
    const domains = Array.isArray(analysis.domains) ? analysis.domains : [analysis.domains]
    const coretech = Array.isArray(analysis.coretech) ? analysis.coretech : []
    const usecases = Array.isArray(analysis.usecases) ? analysis.usecases : []

    return `---
id: ${meta.id}
source_raw: raw/github/${rawFileName}
title: ${meta.title}
author: ${meta.author}
url: ${meta.url}
domains: [${domains.join(', ')}]
language: ${details.language}
stars: ${details.stars}
compiled_at: ${now}
---

# ${meta.title}

> ${analysis.oneLiner}

## 摘要

${analysis.summary}

## 核心技術

${coretech.map(t => `- ${t}`).join('\n')}

## 適用場景

${usecases.map(u => `- ${u}`).join('\n')}

## 洞見

${analysis.insight}

---

**來源**: [${meta.author}/${meta.title}](${meta.url}) | **語言**: ${details.language} | **⭐ Stars**: ${details.stars}

*編譯時間: ${now}*
`
  }

  async compileAll(platform) {
    const rawDir = path.join(this.vaultPath, 'raw', platform)
    if (!fs.existsSync(rawDir)) return

    const files = fs.readdirSync(rawDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.'))

    let compiled = 0, skipped = 0, errors = 0

    for (const file of files) {
      try {
        const result = await this.compileItem(platform, file)
        if (result.skipped) {
          skipped++
        } else if (result.success) {
          compiled++
          console.log(`   ✓ ${result.title}`)
          // 避免打爆 API rate limit
          await new Promise(r => setTimeout(r, 150))
        } else {
          errors++
          console.log(`   ✗ 失敗: ${result.title || file}`)
        }
      } catch (err) {
        errors++
        console.log(`   ✗ 錯誤 ${file}: ${err.message}`)
      }
    }

    console.log(`   完成: 新增 ${compiled} 篇，跳過 ${skipped} 篇，失敗 ${errors} 篇`)
  }
}

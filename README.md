# Second Brain

> 人類知識數位化與動態繼承系統

一個 AI 驅動的個人知識管理系統，讓 Claude 自動從 15+ 平台收集、整理、分析你的知識，像 Git 一樣被繼承和演化。

## ✨ 核心特色

| 特性 | 說明 |
|------|------|
| 🤖 **自動收集** | 從 GitHub、YouTube、Twitter、Chrome 書籤等 15+ 平台自動同步 |
| 📚 **知識沉澱** | LLM Wiki 把原始資料編譯成結構化知識 |
| 👥 **多角色視角** | 工程師、執行長、父親等不同視角看同一份知識 |
| 🍴 **知識繼承** | 角色知識包可以 Git Fork，新人站在前人肩膀上 |
| 🔄 **動態融合** | 繼承別人知識後可修正調整，1+1 大於 2 |
| ⏰ **時效性警告** | 自動警告過時知識 |
| 💼 **點子評分** | AI 評估商業點子潛力 |

## 🚀 快速開始

### 環境需求
- Node.js 18+
- npm 或 yarn
- GitHub Personal Access Token（可選，若使用 GitHub 同步）

### 安裝

```bash
# Clone 專案
git clone https://github.com/username/second-brain-mcp.git
cd second-brain-mcp

# 安裝依賴
npm install

# 設置環境變數
cp .env.example .env
# 編輯 .env，填入你的 API Keys
```

### 運行

```bash
# 開發模式 - 熱重載
npm run dev

# 建構
npm run build

# 生產環境
npm start

# 類型檢查
npm run type-check
```

## 📁 系統架構

### 五層架構

```
Layer 5: 互動層       ← Claude Desktop MCP + Claude Code
           ↓
Layer 4: 知識層       ← LLM Wiki (結構化知識)
           ↓
Layer 3: 儲存層       ← Obsidian Vault (本地 Markdown)
           ↓
Layer 2: 收集層       ← Connectors (自動同步)
           ↓
Layer 1: 來源層       ← 15+ 平台
```

### Vault 結構

```
vault/
├── raw/              # 原始資料（永遠不修改）
│   ├── github/
│   ├── youtube/
│   └── ...
├── wiki/             # LLM 編譯的知識
│   ├── concepts/
│   ├── entities/
│   └── syntheses/
├── roles/            # 角色視角入口
│   ├── engineer/
│   ├── ceo/
│   └── parent/
└── ideas/            # 商業點子評分
    ├── inbox/
    └── evaluated/
```

## 🔌 支援的 Connector

### Phase 1 ✅ (基礎 API)
- [x] GitHub Stars
- [ ] YouTube 收藏
- [ ] Reddit 儲存
- [ ] Chrome 書籤
- [ ] Hacker News

### Phase 2 (擴展 API)
- [ ] Pocket
- [ ] Substack/RSS
- [ ] Gmail Newsletter
- [ ] Notion

### Phase 3 (社群平台)
- [ ] Twitter/X 收藏
- [ ] LinkedIn 儲存
- [ ] Instagram 收藏

### Phase 4 (AI 對話)
- [ ] ChatGPT 對話
- [ ] Claude 對話
- [ ] Gemini 對話

## 💡 使用範例

### 查詢工程師視角的知識

```
Query: "這週有什麼新的 AI 工具？"
→ 系統搜索 wiki/，篩選對 engineer 角色相關的頁面
→ 按時間排序，標註來源時效性
→ 返回結構化答案
```

### 評估商業點子

```
Query: "評估這個點子的商業潛力：<點子描述>"
→ 系統從 vault/ideas/inbox 搜索相關知識
→ LLM 分析競爭對手、市場趨勢、商業模式
→ 輸出評分和建議
```

### 跨來源知識整合

```
同一個 URL 被多個平台收藏
→ 系統自動標記為同一知識點
→ wiki 頁面匯聚所有視角和討論
→ 不同角色看到該知識點的不同側面
```

## 🛠️ 開發指南

### 實現新 Connector

所有 Connector 實作同一個 TypeScript interface：

```typescript
interface Connector {
  // 增量同步：只拉取 since 之後的新資料
  fetchSince(since: Date | null): Promise<RawItem[]>
  
  // 標準格式輸出：Markdown + YAML frontmatter
  toMarkdown(item: RawItem): string
  
  // 去重：檢查資料是否已存在
  isDuplicate(item: RawItem, vaultPath: string): boolean
}
```

### RawItem 格式

```typescript
interface RawItem {
  id: string                    // platform-slug-date
  source_platform: string       // github / youtube / twitter
  source_type: string          // star / bookmark / tweet
  url: string
  title: string
  author: string
  collected_at: Date
  knowledge_type: 'factual' | 'opinion' | 'personal_value'
  visibility: 'public' | 'private'
  content?: string             // 可選：網頁正文
  domains?: string[]           // ingest 時填入
  roles?: Record<string, number> // 角色相關度，ingest 時填入
}
```

## 📖 文檔

- [Vault 使用指南](vault/CLAUDE.md) - 如何組織和查詢知識
- [專案計畫書](docs/second-brain-plan.docx) - 完整的需求和設計文檔
- [Connector 開發指南](docs/CONTRIBUTING.md) (TODO)

## 🤝 貢獻

貢獻指南（建構中）

## 📄 授權

MIT License

## 📧 聯絡

期望未來建立社群 Discord/Slack（建構中）

---

**開始日期**: 2026-04-23  
**當前版本**: v0.1.0 (MVP Phase 1)

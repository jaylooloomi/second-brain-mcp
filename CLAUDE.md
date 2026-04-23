# Second Brain 專案

## 專案目標

一個以 MCP 為核心的開源套件，讓任何人一行指令就能把 Claude 變成自動收集、整理、分析個人知識的第二大腦。

## 核心特色

- ✅ 15+ 平台自動同步（GitHub、YouTube、Twitter、Chrome 書籤等）
- ✅ raw/wiki 兩層分離，知識永遠可追溯
- ✅ 多角色視角（工程師、執行長、父親等）
- ✅ 角色知識包可 Git Fork 分享
- ✅ 動態融合 - 繼承別人知識後可修正調整
- ✅ 來源時效性警告 - 自動提醒過時知識

## 技術棧

- **Runtime**: Node.js + TypeScript
- **Knowledge Storage**: Obsidian Vault (本地 Markdown)
- **Integration**: Claude MCP Server
- **Web Scraping**: Playwright + Readability
- **Data Format**: Standard Markdown with YAML frontmatter

## 專案結構

```
second-brain-mcp/
├── connectors/           # 各平台 API 適配器
│   ├── github/          # GitHub Stars Connector
│   ├── youtube/         # YouTube Connector (TODO)
│   └── ...
├── src/                 # 核心邏輯
│   ├── mcp-server.ts    # MCP Server 實現
│   ├── llm-wiki.ts      # Wiki 編譯引擎
│   ├── ingest-agent.ts  # 知識沉澱 Agent
│   └── utils/           # 工具函數
├── vault/               # Obsidian Vault 資料
│   ├── raw/             # 原始資料（永不修改）
│   ├── wiki/            # 知識層（LLM 編譯）
│   ├── roles/           # 角色視角
│   ├── ideas/           # 商業點子評分
│   ├── CLAUDE.md        # Vault 使用指南
│   └── .sync-state.json # 同步狀態記錄
├── .env                 # 環境變數（API Keys）
├── CLAUDE.md            # 本檔案
├── README.md            # 專案說明
└── package.json         # 依賴清單
```

## 開發流程

### Phase 1: 第一條完整資料流（Week 1-4）
- Week 1: GitHub Stars Connector
- Week 2: LLM Wiki 編譯
- Week 3: Claude Code 整合
- Week 4: YouTube + Chrome Bookmark Connector

### Phase 2: API Connector (Week 5-8)
- Pocket, Substack/RSS, Gmail Newsletter, Notion

### Phase 3: 核心差異化 (Week 9-12)
- 多角色系統、商業點子評分、時效性警告、一鍵安裝

### Phase 4: 開源社群 (Week 13+)
- 社群 Connector、AI 對話集成

## 設置步驟

### 1. 準備環境
```bash
# 複製 .env.example
cp .env.example .env

# 設置 GitHub Personal Access Token
# 編輯 .env，填入你的 token
```

### 2. 運行系統
```bash
# 開發模式
npm run dev

# 建構
npm run build

# 生產環境
npm start
```

## API 金鑰設置

### GitHub
1. 訪問 https://github.com/settings/tokens
2. 建立新 Token（需要 `public_repo` 權限）
3. 複製 Token 填入 `.env` 的 `GITHUB_TOKEN`

### YouTube（待實現）
1. 訪問 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案並啟用 YouTube Data API v3
3. 建立 API Key 或 OAuth 憑證
4. 複製 Key 填入 `.env` 的 `YOUTUBE_API_KEY`

## 命名慣例

- **Connector**: 各平台適配器，實作標準 interface
  - `fetchSince(since: Date | null): Promise<RawItem[]>`
  - `toMarkdown(item: RawItem): string`
  - `isDuplicate(item: RawItem, vaultPath: string): boolean`

- **RawItem**: 原始資料物件，包含 frontmatter 和內容
- **Wiki Page**: 經 LLM 編譯的知識頁面
- **Role**: 角色視角，如 engineer, ceo, parent

## 重要設計原則

1. **raw/ 永不修改** - 保留原始資料以便重新編譯
2. **wiki 是唯一查詢介面** - 所有查詢都指向 wiki，不直接查詢 raw
3. **增量同步** - 只抓新資料，記錄 last_sync，錯過排程沒有影響
4. **一個一個 ingest** - 保留每個來源的完整追溯，便於除重和交叉參照
5. **多角色視角** - 同一份知識，不同角色看到不同洞見

## 貢獻指南

期望未來開源發布時的貢獻流程：

1. Fork 本專案
2. 建立新 branch: `git checkout -b feature/new-connector`
3. 提交 PR，遵循標準 Connector interface

## 相關資源

- 📄 完整專案計畫書: `docs/second-brain-plan.docx`
- 🔗 GitHub: (未來發布)
- 📖 文檔: (建構中)

---

**開始日期**: 2026-04-23
**當前版本**: v0.1.0 (MVP Phase 1)

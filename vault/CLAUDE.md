# Second Brain Vault 使用指南

## 概述
這個 Obsidian Vault 是一個 AI 驅動的個人知識管理系統，由 Claude 自動整理和分析。

## 資料夾結構

### raw/ - 原始資料層（永遠不修改）
- `github/` - GitHub Stars 原始資料
- `youtube/` - YouTube 收藏原始資料
- `twitter/` - Twitter 收藏原始資料
- 其他平台資料...

每個檔案包含標準 frontmatter:
```yaml
id: platform-slug-date
source_platform: github / youtube / twitter
source_type: star / bookmark / tweet
url: https://...
title: 頁面標題
author: 作者名稱
collected_at: 2026-04-23T12:00:00Z
knowledge_type: factual / opinion / personal_value
visibility: public / private
domains: []
roles: {}
```

### wiki/ - 知識層（由 LLM 編譯）
- `concepts/` - 概念頁面，每個檔案代表一個概念
- `entities/` - 人物、工具、公司頁面
- `syntheses/` - 跨來源整合分析
- `index.md` - 所有頁面的總目錄

### roles/ - 角色視角入口
- `engineer/index.md` - 工程師視角的知識地圖
- `ceo/index.md` - 執行長視角的知識地圖
- 其他角色...

每個角色資料夾只存指向 wiki/ 頁面的指標，不存儲知識本身。

### ideas/ - 商業點子評分
- `inbox/` - 待評分的點子
- `evaluated/` - 已評分的點子

## 使用規則

1. **raw/ 永遠不修改** - 原始資料是知識追溯的來源
2. **wiki/ 是查詢介面** - 所有查詢都指向 wiki/，不直接查詢 raw/
3. **增量同步** - 系統自動同步新資料，不重複、不遺漏
4. **多角色視角** - 同一份知識，不同角色看到不同洞見

## 🚀 快速指令

用戶說任何「整理知識」、「做知識沉澱」、「處理 vault」、「幫我標記」之類的話時，**直接執行標準工作流，不需要問用戶任何細節**。

---

## 📋 標準知識沉澱工作流（每次執行）

### 第一步：確認狀態
```
vault_stats  → 看有多少未處理項目
```

### 第二步：批次貼標（每批 30 筆）
```
vault_list_raw(untagged_only=true, limit=30)
→ 對每一筆：vault_read_raw 讀內容
→ 判斷標籤（見下方標籤定義）
→ vault_update_raw_tags 寫入標籤
→ 繼續下一批，直到沒有未貼標項目
```

### 第三步：生成 Wiki（每批貼標後立即執行）
```
針對本批標記的項目，識別值得建立 wiki 的主題：
- 工具/框架 → wiki/entities/工具名.md
- 概念/趨勢 → wiki/concepts/概念名.md
- 跨來源整合 → wiki/syntheses/主題名.md
→ vault_write_wiki 寫入
```

### 完成後回報
```
✅ 本次處理：X 筆
📊 標籤分布：點子 X | 工具 X | 學習 X | 趨勢 X
📝 新增 Wiki：X 頁
⏳ 剩餘未處理：X 筆
```

---

## 🏷️ 四個標籤定義

| 標籤 | 定義 | 貼標條件 |
|------|------|---------|
| **點子** | 看到後想到「可以做成產品/服務/生意」 | 有商業模式、解決市場痛點、可 fork 成產品 |
| **工具** | 現在或未來可直接拿來用的工具/框架/程式庫 | 可 npm/pip install、有明確使用場景 |
| **學習** | 增進知識/技能/語言能力的學習資源 | 教學文章、課程、書籍、需要閱讀消化 |
| **趨勢** | 產業動向、市場情報、值得關注的技術方向 | 描述領域在發生什麼、新技術方向、競品分析 |

**多標籤規則**：同一項目可貼多個，例如 langgraph → [工具, 趨勢]

**跳過規則**：成人內容 → 不貼標直接跳過（但仍算處理完）

---

## Wiki 頁面格式

```markdown
---
title: 頁面標題
type: entity | concept | synthesis
tags: [工具, 趨勢]
sources:
  - platform/file-id
updated: 2026-04-29
---

## 簡介
一段話說明這是什麼。

## 核心功能 / 重點
- 要點 1
- 要點 2

## 為什麼值得關注
結合多個來源的洞見。

## 相關連結
- [[其他wiki頁面]]
```

---

## Claude 的工作流

1. 接收新資料 → 存進 raw/
2. 掃描 raw/ 資料 → 產出 wiki 頁面
3. 更新 wiki/index.md → 記錄新增和修改
4. 評估對各角色的相關度 → 更新 roles/ 指標

## 來源時效性警告

當提供答案時，自動檢查 sources 的時間戳記：
- < 1 年：正常顯示
- 1-2 年：⚠️ 建議確認是否仍然適用
- > 2 年：🔴 基於較舊的資料

## 隱私設定

- `visibility: private` 的頁面不分享
- 分享前掃描「人名 + 負面評價」組合
- 僅自動分享 `visibility: public` 的知識

---

**最後更新**: 2026-04-23

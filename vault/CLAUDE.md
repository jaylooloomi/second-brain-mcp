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

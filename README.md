# 鐵人日誌 — Workout Tracker

深色系重訓追蹤 Web App，專為手機使用設計。前端靜態託管於 GitHub Pages，後端 API 運行在 Cloudflare Worker，資料透過 GitHub API 儲存於 repo 中的 JSON 檔案。

## 功能

### 訓練紀錄
- 記錄每日是否重訓
- 選擇訓練部位（胸、背、肩、二頭、三頭、腿、核心、有氧）
- 記錄訓練動作、每組重量與次數
- 記錄訓練時長

### 組間休息計時器
- 預設時間：30s / 1:00 / 1:30 / 2:00 / 3:00
- 環形進度動畫
- 倒數結束震動提醒

### Dashboard 總覽
- 本週訓練次數
- 本月訓練次數
- 連續訓練天數
- 週曆與月曆視覺化
- 最近訓練列表

### 訓練分析
- 訓練頻率（週次長條圖）
- 重量進步追蹤（各動作最大重量變化）
- 訓練時長趨勢
- 部位分佈比例圖
- 可依部位與時間區間篩選

## 技術架構

```
┌─────────────────┐       ┌──────────────────────┐       ┌─────────────┐
│  GitHub Pages   │──────▶│  Cloudflare Worker   │──────▶│  GitHub API │
│  (靜態前端)      │  API   │  (驗證 + 路由)        │  R/W   │  (JSON 檔案) │
└─────────────────┘       └──────────────────────┘       └─────────────┘
```

| 層級 | 技術 | 說明 |
|------|------|------|
| 前端 | HTML + CSS + Vanilla JS | 零依賴，手機優先 RWD |
| 後端 | Cloudflare Worker | 登入驗證（JWT）、資料 CRUD |
| 儲存 | GitHub Contents API | 讀寫 repo 中的 `data/workouts.json` |
| 認證 | HMAC-SHA256 JWT | 30 天效期，存於 localStorage |

## 專案結構

```
workout-tracker/
├── index.html              # 主頁面
├── css/
│   └── style.css           # 深色 + 黃色跳色風格
├── js/
│   └── app.js              # 前端邏輯
├── data/
│   └── workouts.json       # 訓練資料（由 Worker 透過 GitHub API 讀寫）
├── manifest.json           # PWA manifest
├── worker/
│   ├── worker.js           # Cloudflare Worker 原始碼
│   └── wrangler.toml       # Wrangler 部署設定
├── README.md
└── GETTING_STARTED.md      # 完整部署教學
```

## 設計風格

- 深色系背景（#0d0d1a / #1a1a2e）
- 黃色跳色（#f5c518）
- 手機優先 UI，所有操作單手可完成
- 無框架依賴，載入快速

## 快速開始

詳細部署步驟請參閱 [GETTING_STARTED.md](./GETTING_STARTED.md)。

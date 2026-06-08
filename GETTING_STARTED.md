# Getting Started — 完整部署教學

本文件涵蓋從零開始到完整上線的所有步驟。

---

## 目錄

1. [前置需求](#前置需求)
2. [建立 GitHub Repository](#建立-github-repository)
3. [產生 GitHub Personal Access Token](#產生-github-personal-access-token)
4. [部署 Cloudflare Worker](#部署-cloudflare-worker)
5. [設定前端 API 位址](#設定前端-api-位址)
6. [部署 GitHub Pages](#部署-github-pages)
7. [驗證部署](#驗證部署)
8. [自訂設定](#自訂設定)
9. [疑難排解](#疑難排解)

---

## 前置需求

- [Node.js](https://nodejs.org/) v18+（用於 Wrangler CLI）
- [Git](https://git-scm.com/)
- GitHub 帳號
- Cloudflare 帳號（免費方案即可）

---

## 建立 GitHub Repository

### 1. 建立新 repo

前往 https://github.com/new 建立一個新的 repository：

- **Repository name**: `workout-tracker`（或自訂名稱）
- **Visibility**: **Public 或 Private 均可**（由於我們加入了 AES-GCM 資料加密功能，即使是 Public repo，他人也無法讀取您的訓練細節）。
- 不要勾選 Initialize with README（我們會自己 push）

### 2. Push 專案到 GitHub

```bash
cd workout-tracker

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/workout-tracker.git
git push -u origin main
```

> 將 `YOUR_USERNAME` 替換成你的 GitHub 帳號名稱。

### 3. 確認 data 目錄

確保 `data/workouts.json` 已存在於 repo 中，內容為：

```json
{
  "workouts": []
}
```

---

## 產生 GitHub Personal Access Token

Worker 需要透過 GitHub API 讀寫 `data/workouts.json`，因此需要一個 token。

### 步驟

1. 前往 https://github.com/settings/tokens?type=beta （Fine-grained tokens）
2. 點擊 **Generate new token**
3. 設定：
   - **Token name**: `workout-tracker-worker`
   - **Expiration**: 選擇你偏好的期限（建議 90 天以上，過期需重新產生）
   - **Repository access**: 選擇 **Only select repositories** → 選取 `workout-tracker`
   - **Permissions**:
     - **Contents**: Read and write（必須）
4. 點擊 **Generate token**
5. **立即複製 token**，之後無法再看到

> 如果 repo 是 private，token 需要有該 repo 的存取權限。

---

## 部署 Cloudflare Worker

### 1. 安裝 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登入 Cloudflare

```bash
wrangler login
```

瀏覽器會開啟授權頁面，點擊允許。

### 3. 進入 worker 目錄

```bash
cd worker
```

### 4. 設定環境變數（Secrets）

以下變數含敏感資訊，透過 `wrangler secret` 設定（不會出現在程式碼中）：

```bash
# 登入帳號
wrangler secret put USERNAME
# 登入密碼
wrangler secret put PASSWORD

# JWT 簽名密鑰（隨機長字串）
wrangler secret put JWT_SECRET

# 資料加密密鑰 (重要！)
# 用於 AES-GCM 加密 workouts.json，設定後請勿隨意更換，否則舊資料將無法解密。
wrangler secret put ENCRYPTION_KEY
# 輸入一段長密鑰，例如: my-super-secret-workout-key-2024

# GitHub Token（上一步產生的）
wrangler secret put GITHUB_TOKEN

# GitHub Repo（格式: owner/repo）
wrangler secret put GITHUB_REPO

# --- 資料加密 (Security & Privacy) ---
# 本專案在 Worker 端實現了 AES-GCM 透明加解密：
# 1. 安全性：資料在離開 Worker 存往 GitHub 之前會被加密；從 GitHub 讀取後才會在 Worker 內解密。
# 2. 隱私：即使您的 Repo 是 Public，別人在 data/workouts.json 看到的也只是一串 Base64 亂碼。
# 3. 備份：請妥善保管 ENCRYPTION_KEY，丟失密鑰將導致資料無法還原。
```

> 產生隨機 JWT_SECRET 的快速方法：
> ```bash
> openssl rand -hex 32
> ```

### 5. 確認 wrangler.toml

`worker/wrangler.toml` 中的非敏感設定：

```toml
name = "workout-tracker"
main = "worker.js"
compatibility_date = "2024-01-01"

[vars]
DATA_PATH = "data/workouts.json"
DATA_BRANCH = "main"
```

- `DATA_PATH`: JSON 檔案在 repo 中的路徑
- `DATA_BRANCH`: 要讀寫的分支名稱

### 6. 部署 Worker

```bash
wrangler deploy
```

部署成功後會顯示 Worker 的 URL，格式類似：

```
https://workout-tracker.YOUR_SUBDOMAIN.workers.dev
```

**記下這個 URL**，下一步需要用到。

### 7. 驗證 Worker 是否正常

```bash
# 測試登入
curl -X POST https://workout-tracker.YOUR_SUBDOMAIN.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USERNAME","password":"YOUR_PASSWORD"}'

# 應回傳: {"token":"eyJ..."}
```

---

## 設定前端 API 位址

修改 `js/app.js` 第一行，將 Worker URL 填入：

```javascript
const API_BASE = 'https://workout-tracker.YOUR_SUBDOMAIN.workers.dev';
```

替換成你上一步取得的實際 Worker URL（結尾不加 `/`）。

修改後 commit 並 push：

```bash
cd ..  # 回到專案根目錄
git add js/app.js
git commit -m "Set API base URL"
git push
```

---

## 部署 GitHub Pages

### 方法 A：從 Settings 開啟（推薦）

1. 前往你的 repo → **Settings** → **Pages**
2. **Source**: 選擇 **Deploy from a branch**
3. **Branch**: 選擇 `main`，目錄選 `/ (root)`
4. 點擊 **Save**
5. 等待 1-2 分鐘，GitHub 會自動部署

部署完成後，你的網站 URL 為：

```
https://YOUR_USERNAME.github.io/workout-tracker/
```

### 方法 B：使用 GitHub Actions（進階）

如果需要更多自訂部署流程，可在 `.github/workflows/` 加入 CI/CD。對於純靜態網站，方法 A 已足夠。

### 注意事項

如果你的 repo 是 **Private**：
- GitHub Pages 在 Free 方案只支援 public repos
- 如果需要 private repo + Pages，需要 GitHub Pro 或將前端檔案放到另一個 public repo

---

## 驗證部署

### 1. 開啟網站

在手機瀏覽器開啟：

```
https://YOUR_USERNAME.github.io/workout-tracker/
```

### 2. 測試登入

輸入你在 `wrangler secret put USERNAME` 和 `PASSWORD` 時設定的帳號密碼。

### 3. 測試完整流程

1. ✅ 登入成功，進入主畫面
2. ✅ 選擇訓練部位
3. ✅ 新增訓練動作（含重量和次數）
4. ✅ 輸入訓練時長
5. ✅ 點擊儲存 → 顯示「儲存成功！」
6. ✅ 切換到計時器 → 倒數計時正常
7. ✅ 切換到總覽 → 看到今日訓練紀錄
8. ✅ 切換到分析 → 看到圖表

### 4. 確認資料已寫入

前往 GitHub repo → `data/workouts.json`，確認檔案內容已更新。

---

## 自訂設定

### 修改登入帳密

```bash
cd worker
wrangler secret put USERNAME   # 輸入新帳號
wrangler secret put PASSWORD   # 輸入新密碼
```

修改後現有 token 仍然有效（直到過期），如需立即失效所有 session，同時更換 `JWT_SECRET`：

```bash
wrangler secret put JWT_SECRET  # 輸入新的隨機字串
```

### 新增訓練部位

編輯 `index.html` 中的 `.muscle-chips` 區塊和 `js/app.js` 中的 `MUSCLE_LABELS` 物件。

### 調整計時器預設時間

編輯 `index.html` 中的 `.timer-presets` 區塊，修改 `data-seconds` 屬性。

### 自訂域名

**GitHub Pages 自訂域名：**
1. Settings → Pages → Custom domain
2. 輸入你的域名（例如 `workout.yourdomain.com`）
3. 在 DNS 加入 CNAME 記錄指向 `YOUR_USERNAME.github.io`

**Cloudflare Worker 自訂域名：**
1. Cloudflare Dashboard → Workers → 你的 Worker → Triggers
2. 加入 Custom Domain（需要你的域名在 Cloudflare DNS 上）

---

## 疑難排解

### 登入失敗

| 症狀 | 原因 | 解法 |
|------|------|------|
| 「帳號或密碼錯誤」 | 帳密不符 | 確認 `wrangler secret` 設定值 |
| 網路錯誤 | API_BASE 設定錯誤 | 確認 `js/app.js` 中的 URL |
| CORS 錯誤 | Worker 未正確回應 OPTIONS | 確認 Worker 已部署最新版本 |

### 儲存失敗

| 症狀 | 原因 | 解法 |
|------|------|------|
| 「GitHub write failed: 404」 | Token 無權限或 repo 路徑錯誤 | 確認 GITHUB_REPO 和 DATA_PATH |
| 「GitHub write failed: 409」 | 並發寫入衝突 | 重新嘗試儲存 |
| 「GitHub write failed: 401」 | Token 過期或無效 | 重新產生 token 並更新 secret |

### GitHub Pages 404

- 確認 Settings → Pages 已開啟
- 確認 branch 和目錄設定正確
- 等待 2-3 分鐘讓部署完成
- 確認 `index.html` 在 repo 根目錄

### Worker 部署失敗

```bash
# 確認 wrangler 已登入
wrangler whoami

# 重新登入
wrangler login

# 查看部署日誌
wrangler tail
```

### 手機上無法加入主畫面

確保 `manifest.json` 存在且 `index.html` 中有引用：
```html
<link rel="manifest" href="manifest.json">
```

---

## 更新部署

### 更新前端

```bash
git add .
git commit -m "Update frontend"
git push
```

GitHub Pages 會在 1-2 分鐘內自動重新部署。

### 更新 Worker

```bash
cd worker
wrangler deploy
```

部署即時生效。

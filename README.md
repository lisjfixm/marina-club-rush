# Marina Club Rush

Poki 離線版 Unity 6 WebGL 成品。原始來源：<https://poki.com/zh/g/marina-club-rush>

| 項目 | 值 |
|---|---|
| 產品內部名稱 | CapitalistFisherman |
| 開發商 | Xscape |
| Unity 版本 | 6000.5.4f1（Unity 6） |
| 畫面尺寸 | 960 × 600 |
| WebGL | WebGL 2.0，未開啟 threads |
| 目前版本 | 1.5 |

## 啟動方式

### Windows（本機離線包）

雙擊 `啟動 Marina Club Rush.bat`，會在 `127.0.0.1:8781` 啟動本機伺服器並開啟遊戲。

### 手動啟動

```bash
python -m http.server 8781
# 瀏覽器開啟 http://127.0.0.1:8781/index.html
```

> 建議透過本機伺服器執行；直接 `file://` 開啟可能因 WebGL 資源讀取限制而無法載入。伺服器需提供正確 MIME（`.wasm` → `application/wasm`）。

### GitHub Pages

倉庫已啟用 GitHub Pages，來源為 `main` 分支根目錄，線上版本與根目錄 `index.html` 同步。

## 目錄結構

```
MarinaClubRush/
├── index.html              # 入口：window.config + 離線 PokiSDK stub
├── unity-2020.js           # 載入器、載入畫面與 Poki bridge
├── autopilot.js            # 自動遊玩模式（合成輸入，預設關閉）
├── 啟動 Marina Club Rush.bat
├── Build/                  # Unity loader / framework / .data / .wasm
├── StreamingAssets/       # 遊戲串流資源（音樂）
├── fonts/                 # Torus 字體
├── screenshots/            # 載入輪播截圖
└── README.md
```

## 自動遊玩模式

- 左上角 **Auto** 按鈕切換開關，預設關閉；也可呼叫 `window.MarinaAutopilot.toggle() / enable() / disable() / isActive()`。
- 成品是編譯後的 Unity WebGL，未暴露內部狀態 API，因此自動駕駛在 JS 層以**合成鍵盤事件**（WASD 與方向鍵）驅動角色，依隨機方向分段漫遊。
- 限制：bot 不讀取魚群、金幣或碰撞狀態，屬漫遊式自動駕駛，不保證完成全部目標，也可能在障礙旁停留；關閉後會釋放所有按住的按鍵。
- 未更動 `Build/` 內的 wasm/data 成品。

## 離線改動說明

- **PokiSDK 本地樁**：`index.html` 內以 stub 取代官方 SDK，廣告插播直接回調、獎勵廣告直接發放成功、登入／使用者／分析／錯誤回報皆為空實作，不再請求 Poki 後端。
- **縮圖全部本地**：載入畫面預設縮圖與後備路徑皆指向 `screenshots/1-small.jpg`，不再引用 `img.poki-cdn.com`。
- **音樂副檔名**：`StreamingAssets/Music_0.mp3.txt` 實為 MP3，但 `.data` 內寫死的載入路徑即為此檔名，**請勿改回 `.mp3`**，否則音樂會載入失敗。
- **原始載入器備份**：原始 Poki `master-loader.js`（會拉遠端 SDK）保留在本地 `_reference/`，已加入 `.gitignore`，未進入倉庫，也不接回頁面。

## 二進位檔策略

`Build/*.wasm`（約 19 MB）與 `Build/*.data`（約 9 MB）直接提交進 git，**未使用 Git LFS**：本專案為單機靜態離線成品，版本數有限，直接提交的成本可接受；若日後改版頻繁、倉庫體積明顯膨脹，再評估改用 LFS。

## 版本記錄

### 1.5（2026-11-15）

- 新增自動遊玩模式：左上角 Auto 按鈕切換，JS 層合成輸入漫遊，預設關閉。
- 補上自動駕駛實作方式與限制說明。

### 1.4（2026-11-15）

- 移除殘留的 Poki CDN 縮圖後備，預設與後備路徑皆改本地截圖。
- 完成 PokiSDK stub 方法覆蓋盤點（廣告、獎勵、登入、使用者、語言、分析、錯誤回報等）。
- 補上本 README 與二進位策略說明。

### 1.3

- 自 Poki 離線包匯入的原始 Unity WebGL 成品。

# Hanabi Stage

以 Node.js、Express、SQLite 與 HTML5 Canvas 製作的網頁版舞碼隊形編排原型。完成後可直接建立舞者、調整舞台位置、切換隊形，並以插值動畫預覽走位。

## 已實作功能

- 舞碼專案的新增、讀取、編輯與刪除
- 一鍵完整複製專案、舞者、隊形、座標與注解
- 16:9、4:3、1:1 與自訂舞台尺寸
- 舞者代號、名稱、代表顏色的管理
- 多隊形時間軸與進場過渡秒數
- 時間軸隊形可透過拖曳把手調整演出順序
- Canvas 滑鼠／觸控拖曳；手機單指可上下捲動頁面及左右平移放大舞台，雙指可縮放與平移
- 每個隊形可加入、編輯、刪除及拖曳文字注解
- 同專案、同隊形的多人即時協作、線上名單與遠端拖曳預覽
- 舞台顯示尺寸可拖曳調整，超出自動顯示雙向捲軸
- 桌面版左右面板與底部時間軸可拖曳調整大小，並自動記住尺寸
- 時間軸固定在視窗底部
- 手機版保留可橫向滑動的舞者列
- 手機版隊形設定與時間軸採互斥摺疊面板
- 舞台深色模式、網格開關與強化網格
- `easeInOutCubic` 隊形間平滑走位預覽
- 拖曳座標即時自動儲存
- 匯出完整版或簡化版 PDF
- SQLite 外鍵、唯一性與 JSON 合法性約束
- 首次啟動自動建立 8 人、3 隊形示範資料

## 專案結構

```text
hanabiarr/
├─ database/
│  └─ schema.sql          # SQLite Schema
├─ public/
│  ├─ css/styles.css      # 響應式工作台樣式
│  ├─ js/api.js           # 瀏覽器 API client
│  ├─ js/app.js           # 頁面狀態與操作流程
│  ├─ js/stage.js         # Canvas 繪製、拖曳與動畫
│  └─ index.html          # 主要工作台
├─ src/
│  ├─ routes/
│  │  ├─ projects.js      # 專案 API
│  │  ├─ dancers.js       # 舞者 API
│  │  └─ formations.js    # 隊形 API
│  ├─ app.js              # Express app factory
│  ├─ database.js         # SQLite 初始化與示範資料
│  ├─ http.js             # 驗證與 API error
│  ├─ repository.js       # 共用查詢與座標正規化
│  ├─ pdf.js              # PDF 版面與舞台圖輸出
│  └─ server.js           # 啟動入口
├─ assets/fonts/           # PDF 內建 Noto Sans TC 字型與 OFL 授權
├─ test/
│  └─ api.test.js         # Node test API 整合測試
└─ package.json
```

## 執行

```powershell
npm install
npm start
```

開啟 `http://localhost:3030`。開發時可使用：

```powershell
npm run dev
npm test
```

資料庫預設儲存在 `data/hanabi.db`。可用環境變數覆蓋：

```powershell
$env:PORT = "3001"
$env:DATABASE_PATH = "D:\hanabiarr\data\local.db"
npm start
```

PDF 匯出會優先使用專案內建的 Noto Sans TC，並自動搜尋 Windows 的 DengXian／Microsoft JhengHei，以及 Ubuntu 常見的 Noto CJK、文泉驛中文字型。`.ttf`、`.otf` 與 `.ttc` 字型集合皆可解析。必要時可用 `PDF_CJK_FONT` 指定字型：

```powershell
$env:PDF_CJK_FONT = "C:\path\to\NotoSansCJK-Regular.ttc"
npm start
```

## Ubuntu + nginx

前端 API 使用相對路徑 `/api/...`，不包含 `localhost`，所以瀏覽器會向目前網域請求，再由 nginx 轉到本機 Node.js。正式環境不需要把前端程式中的路徑改為雲端 IP 或網域。

安裝 nginx：

```bash
sudo apt update
sudo apt install -y nginx
```

專案已內建 `assets/fonts/NotoSansTC-Variable.ttf`，因此 PDF 不再依賴 Ubuntu 是否安裝系統中文字型。

Node.js 建議只監聽本機，讓 nginx 對外提供服務：

```bash
PORT=3030 \
HOST=127.0.0.1 \
DATABASE_PATH=/var/lib/hanabi/hanabi.db \
node src/server.js
```

部署後可直接檢查雲端 PDF 字型：

```bash
curl https://stage.example.com/api/health/pdf
```

正常結果應包含 `"available": true` 與 `"source": "bundled"`。

即時協作使用 `/ws` WebSocket。nginx 必須轉送 `Upgrade` 與 `Connection` header，範例設定已包含：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;
```

瀏覽器會依目前網址自動使用 `ws://` 或 `wss://`，不需要另外設定 localhost 或雲端網址。

nginx 範例位於 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)。設定時將 `server_name` 換成你的網域，啟用後執行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

建議使用獨立網域或站台根路徑，例如 `https://stage.example.com/`。目前前端資源與 API 路徑以根路徑為基準；若要部署在 `https://example.com/hanabi/` 這類子目錄，需要另外加入 base path 設定。

## 資料模型

`projects` 是一首舞曲或一個演出專案，保存舞台寬高。`dancers` 隸屬於專案，舞者代號在單一專案內唯一。`formations` 保存隊形順序、過渡秒數與 `positions_json`。

`positions_json` 的結構如下，鍵是舞者資料庫 ID：

```json
{
  "1": { "x": 24.5, "y": 16 },
  "2": { "x": 72, "y": 30.5 }
}
```

座標原點在舞台左上角，`x` 往右遞增，`y` 往舞台前方遞增。座標範圍由所屬專案的 `stage_width` 與 `stage_height` 決定。目前規模以 JSON 保存一次寫入的完整隊形較有效率；若未來需要單一舞者座標查詢、歷史版本或多人協作，可再拆成 `formation_positions(formation_id, dancer_id, x, y)` 關聯表。

完整 schema 位於 [`database/schema.sql`](database/schema.sql)。

## API

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康檢查 |
| `GET` | `/api/health/pdf` | 檢查 PDF 中文字型是否可用 |
| `GET` | `/api/projects` | 專案列表 |
| `POST` | `/api/projects` | 新增專案與第一個隊形 |
| `POST` | `/api/projects/:projectId/duplicate` | 完整複製專案 |
| `GET` | `/api/projects/:projectId` | 專案、舞者與隊形完整資料 |
| `GET` | `/api/projects/:projectId/export.pdf?mode=full` | 匯出完整專案 PDF |
| `GET` | `/api/projects/:projectId/export.pdf?mode=simple` | 匯出隊形名稱與舞台排位圖 |
| `PATCH` | `/api/projects/:projectId` | 編輯專案與舞台尺寸 |
| `DELETE` | `/api/projects/:projectId` | 刪除專案 |
| `GET` | `/api/projects/:projectId/dancers` | 舞者列表 |
| `POST` | `/api/projects/:projectId/dancers` | 新增舞者 |
| `PATCH` | `/api/projects/:projectId/dancers/:dancerId` | 編輯舞者 |
| `DELETE` | `/api/projects/:projectId/dancers/:dancerId` | 刪除舞者 |
| `GET` | `/api/projects/:projectId/formations` | 隊形列表 |
| `POST` | `/api/projects/:projectId/formations` | 新增隊形 |
| `PUT` | `/api/projects/:projectId/formations/reorder` | 批次調整隊形順序 |
| `PATCH` | `/api/projects/:projectId/formations/:formationId` | 更新名稱、秒數或座標 |
| `DELETE` | `/api/projects/:projectId/formations/:formationId` | 刪除隊形 |

建立隊形範例：

```http
POST /api/projects/1/formations
Content-Type: application/json

{
  "name": "Chorus Line",
  "transitionSeconds": 2.5,
  "positions": {
    "1": { "x": 12, "y": 28 },
    "2": { "x": 28, "y": 28 }
  }
}
```

更新拖曳座標範例：

```http
PATCH /api/projects/1/formations/4
Content-Type: application/json

{
  "positions": {
    "1": { "x": 18.5, "y": 31 },
    "2": { "x": 61, "y": 24 }
  }
}
```

## 後續擴充方向

- 隊形拖曳排序與批次插入／刪除
- 音樂上傳、節拍標記與時間軸對齊
- Undo／Redo 與版本快照
- 路徑衝突、舞者碰撞與安全間距提示
- WebSocket 多人同步編輯
- 匯出 PNG 或影片

# Chamber / Metashield Protocol Architecture

這份文件描述整套系統的資料流與責任分工，包含 `extension`、`backend`、`web3` 與公開網頁。

## Overview

```mermaid
flowchart TB
  subgraph Client["使用者端"]
    FB["Facebook / IG / Threads / X<br/>社群平台頁面"]
    EXT["Chrome Extension<br/>popup.js / content.js / background.js"]
    UI["Popup UI<br/>暱稱綁定 / 一鍵聲明 / 備份設定"]
  end

  subgraph Backend["Chamber Backend / API"]
    API["api/server.js"]
    ID["identity-registry.js<br/>暱稱 / 平台 / 錢包 mapping"]
    STORE["data-layer<br/>identity-registry.json<br/>STATUS / memory"]
    RESOLVE["/identity/resolve<br/>/identity/check<br/>/identity/register<br/>/identity/transfer"]
    BACKUP["/backup<br/>/backup/post<br/>/backup/draft"]
  end

  subgraph Storage["資料與 Web3"]
    R2["Cloudflare R2 / 圖片備份"]
    ARW["Arweave Devnet / 上鏈內容"]
    WALLET["Wallet<br/>主錢包 / 子錢包 / 託管錢包"]
    REG["Web3 Block / 備份內容塊"]
  end

  subgraph Public["公開呈現層"]
    WEB["web-feed<br/>/echo/:wallet/:platform"]
    ECHO["Echo 公開頁<br/>QR code / 時光軸 / 聲明頁"]
  end

  FB --> EXT
  UI <---> EXT

  EXT -->|抓貼文 / 圖文 / composer 自動填入| FB
  EXT -->|送備份請求| API
  API --> RESOLVE
  API --> BACKUP
  RESOLVE --> ID
  BACKUP --> ID
  ID --> STORE

  BACKUP -->|文字 / 圖片 / metadata| R2
  BACKUP -->|寫入備份 block| ARW
  BACKUP --> WALLET
  WALLET --> REG

  API --> WEB
  WEB --> ECHO
  ECHO -->|讀取對應 identity / content key| ID

  UI -->|先設定暱稱別名| RESOLVE
  UI -->|確認可用性| RESOLVE
  UI -->|register binding| RESOLVE
  RESOLVE -->|alias -> wallet / platform mapping| ID

  FB -.->|使用者貼文時| EXT
  EXT -.->|content script 監看| FB
```

## Component Roles

- `extension`
  - `content.js`: 掃描貼文、注入備份按鈕、開發文框、填入圖文
  - `background.js`: 接收備份事件、整理 payload、呼叫 backend
  - `popup.js`: 暱稱綁定、錢包設定、聲明生成、使用者入口
- `backend`
  - `api/server.js`: 對外 API
  - `identity-registry.js`: 管理 alias / platform / wallet mapping
  - `identity-registry.json`: 持久化 registry 資料
- `web3`
  - 保存備份內容、ownership、轉移紀錄與內容塊
- `web`
  - 公開 Echo 頁面
  - 依 mapping 顯示對應時光軸與 QR code

## Flow Summary

1. 使用者在 `popup` 先設定身份暱稱。
2. `backend` 檢查 alias 是否可用，並建立 `alias -> platform -> wallet` mapping。
3. `extension` 讀取 mapping 後，才開放一鍵聲明與備份。
4. 使用者在社群平台發文時，`content.js` 自動填入圖文。
5. `background.js` 把備份內容送到 `backend`。
6. `backend` 寫入 Web3 / 儲存圖片 / 更新 identity registry。
7. `web-feed` 讀取對應身份，公開顯示 Echo 頁面與 QR code。

## Notes

- 這份圖是「現況與目標流程」的合併版，適合拿來做團隊溝通。
- 如果之後要更細，可以再拆成：
  - `extension` 時序圖
  - `identity binding` 狀態圖
  - `backup` 寫入流程圖
  - `wallet transfer` / ownership 轉移圖

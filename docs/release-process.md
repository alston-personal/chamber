# Chamber 發佈流程

## 分支與下載通道

- `main`：已通過測試、可供封測者下載的穩定程式碼。
- `develop`：日常開發整合分支；未完成的功能不得直接進入 `main`。
- `agent/*` 或其他功能分支：單一功能或修正，完成後合併至 `develop`。
- 官網下載：固定指向版本化檔案，例如 `/echo/releases/chamber-extension-v0.5.8.zip`。
- 本機開發包：輸出到 `dist/chamber-extension-dev.zip`，不會改動官網檔案。

目前狀態：官網穩定版仍為 `0.5.8`；`develop` 上的雙語候選版為 `0.6.0`。其自動與人工發佈門檻見 [`docs/i18n-release-checklist.md`](i18n-release-checklist.md)。

## 日常開發

```bash
git switch develop
python3 scripts/pack-extension.py
```

Chrome 開發測試仍建議直接載入 `extension/`。上述 ZIP 只供檢查封裝內容，輸出位於未納入 Git 的 `dist/`。

## 封測版升版

1. 在 `develop` 完成功能與相關測試。
2. 將準備發佈的提交合併至 `main`。
3. 更新 `extension/manifest.json` 版本，並同步官網下載連結與文件。
4. 執行完整測試與正式建置。
5. 明確發佈並更新官網下載：

```bash
python3 scripts/pack-extension.py --release <manifest-version> --promote
```

6. 驗證版本化 ZIP、`releases/latest.json`、官網下載與 ZIP 內的 `manifest.json`。
7. 提交 release commit、建立 Git tag，最後才部署官網。

`--promote` 是唯一允許覆寫相容下載檔 `web-feed/public/chamber-extension.zip` 的流程。只執行一般打包不會影響已發佈版本。

## Mainnet 前的發佈升級

目前封測仍由官網提供版本化檔案與 SHA-256。Mainnet 前，release 流程必須再加入候選 Root Manifest、治理多簽、Genesis ancestry 驗證、manifest 發佈及可驗證 rollback；完整規格見 [`docs/echo-genesis-root.md`](echo-genesis-root.md)。在該流程完成前，不得把 `latest.json` 或 DNS 當成 Echo 的 canonical root of trust。

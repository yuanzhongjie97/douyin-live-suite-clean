# Auto Save Session And Remark Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save a finished session automatically when the anchor goes offline or the user stops manually, keep the stopped session visible/exportable, and show special-follow remarks together with original nicknames.

**Architecture:** Electron passes the real Windows Documents/Desktop paths into the embedded server through environment variables. `CaptureService` waits for the event persistence queue, finalizes the session, then writes Excel to the requested destination: room-offline auto-stop goes to Documents/TangSanjiao/Auto Export, manual stop goes directly to the Desktop root. The React app retains the last viewed session after `activeSession` clears, fetches highlight history for that retained session, and renders matched names as `remark / originalName` while keeping raw data unchanged.

**Tech Stack:** Electron main process, TypeScript server, Fastify API, SQLite-backed storage, ExcelJS exporter, React/Vite web app.

---

## Confirmed Product Rules

- Anchor offline auto-stop: save Excel to `Documents\糖三角\自动导出`.
- Manual `停止采集`: save Excel directly to the real Desktop root, for example `C:\Users\<name>\Desktop\糖三角-20260529-235959-主播-abc123.xlsx`.
- Do not build download progress UI.
- Save failures write a log row only; do not show a popup.
- Special-follow matched event body displays `[备注名 / 原昵称] 礼 xxx`.
- Special-follow remark participates in frontend keyword search.
- Special-follow matching still uses stable ID/link only; remark is not a match key.
- Every subagent and main-agent result must be recorded in `docs/subagent-progress.md`.

## File Structure

- Modify `apps/desktop/main.mjs`
  - Pass real Documents/Desktop paths to the embedded server with environment variables.
- Modify `apps/server/src/config.ts`
  - Read those paths into config.
- Modify `apps/server/src/capture-service.ts`
  - Add safe filename/path helpers.
  - Wait for `eventPersistQueue` before export.
  - Save offline auto-stop to Documents subdirectory.
  - Save manual stop to Desktop root.
  - Add session-id based log rows after finalize.
- Create `apps/server/scripts/regression-auto-save-session.mjs`
  - Verify destination selection, filename sanitization, and no illegal filename characters.
- Modify `apps/web/src/App.tsx`
  - Retain last viewed session after `activeSession` clears.
  - Reset retained/visible state correctly when a new session starts.
  - Fetch highlight matched history for the retained session.
  - Display special-follow matched names as `备注名 / 原昵称`.
  - Include remark text in frontend keyword search only.
  - Add top version entry `V26.5.29.0`.
- Create `apps/web/scripts/regression-stopped-session-and-remarks.mjs`
  - Verify session id selection, display-name formatting, and search text behavior.
- Modify `docs/subagent-progress.md`
  - Append subagent task records, validation commands, risks, and package metadata if packaged.

## Subagent Split

- Worker A, Server/Electron Auto-Save
  - Owns `apps/desktop/main.mjs`, `apps/server/src/config.ts`, `apps/server/src/capture-service.ts`, `apps/server/scripts/regression-auto-save-session.mjs`.
- Worker B, Web Session/Remark Display
  - Owns `apps/web/src/App.tsx`, `apps/web/scripts/regression-stopped-session-and-remarks.mjs`.
- Worker C, Review/Regression
  - Owns no production file. Reviews Worker A/B changes, runs focused static checks where possible, and records findings for `docs/subagent-progress.md`.

If subagent capacity is unavailable, execute inline but preserve the same ownership records in `docs/subagent-progress.md`.

## Task 1: Server/Electron Auto-Save

**Files:**
- Modify: `apps/desktop/main.mjs`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/capture-service.ts`
- Create: `apps/server/scripts/regression-auto-save-session.mjs`

- [ ] Add regression script that imports pure helper exports from `capture-service.ts`.
- [ ] Confirm the script fails before helper implementation.
- [ ] In Electron `startEmbeddedServer()`, set:
  - `DOUYIN_LIVE_SUITE_DOCUMENTS_DIR = app.getPath('documents')`
  - `DOUYIN_LIVE_SUITE_DESKTOP_DIR = app.getPath('desktop')`
- [ ] In server config, expose:
  - `documentsDir`
  - `desktopDir`
- [ ] In `capture-service.ts`, export:
  - `AUTO_EXPORT_DOCUMENTS_SUBDIR = path.join('糖三角', '自动导出')`
  - `sanitizeAutoExportFileNamePart(value)`
  - `buildAutoExportFileName(session)`
  - `resolveAutoExportOutputPath(session, target)`
- [ ] Implement `stop(options?: { autoSave?: 'manual' | 'offline' })`.
  - API manual stop calls `stop({ autoSave: 'manual' })`.
  - Shutdown calls `stop()` and must not auto-save on app exit.
  - Offline auto-stop path calls an internal stop/finalize flow with `autoSave: 'offline'`.
- [ ] Wait for `eventPersistQueue` before exporting.
- [ ] Add `persistSessionLog(sessionId, message, level)` for post-finalize save success/failure logging.
- [ ] Run:
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs`
  - `npm --workspace apps/server run build`
  - `node --check apps/desktop/main.mjs`

## Task 2: Web Session Continuity And Remark Display

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/scripts/regression-stopped-session-and-remarks.mjs`

- [ ] Add a regression script for pure intended behavior:
  - active session beats last session.
  - last session beats empty stats session.
  - display name with remark and original nickname becomes `备注 / 原昵称`.
  - display name without remark stays original nickname.
  - search text includes remark only when the event is matched to a special-follow user.
- [ ] Keep `lastSessionId` in `DashboardApp`.
- [ ] Use `activeSessionId ?? lastSessionId ?? stats.sessionId` for export, stats/events after stop, and highlight matched history.
- [ ] On successful start of a new session, clear previous visible event buckets and `highlightHitEvents`, then set last session to the new active session.
- [ ] Keep `handleClear()` as display-only clear; it must not delete saved Excel or session data.
- [ ] Change `getPreferredUserDisplayName(item, highlightUser)` so matched rows show `remark / originalName`, not only remark.
- [ ] Extend frontend search text to include `highlightUser.remark` for matched rows.
- [ ] Keep profile opening based on original event `userId/userLink`, not remark text.
- [ ] Add `V26.5.29.0` top version-log entry.
- [ ] Run:
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs`
  - `npm --workspace apps/web run build`

## Task 3: Review, Verification, And Documentation

**Files:**
- Modify: `docs/subagent-progress.md`
- Optional package output: `apps/desktop/release/糖三角-V26.5.29.0-安装包.exe`

- [ ] Review that manual stop writes to Desktop root and offline auto-stop writes to Documents subdirectory.
- [ ] Review that app shutdown does not auto-save.
- [ ] Review that save happens after the persistence queue is settled.
- [ ] Review that remark display does not change DB or Excel raw fields.
- [ ] Run focused checks:
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs`
  - `node apps\web\scripts\regression-mystery-refresh.mjs`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs`
  - `npm --workspace apps/server run build`
  - `npm --workspace apps/web run build`
  - `node --check apps/desktop/main.mjs`
- [ ] Append detailed records for Worker A, Worker B, Worker C, and Main Agent to `docs/subagent-progress.md`.
- [ ] If packaging is requested, verify the first `App.tsx` version is `V26.5.29.0`, run `npm run desktop:pack:fast`, and record installer size/SHA256.

## Manual Acceptance

- Start a collection, then manually click `停止采集`; confirm one Excel appears directly on the Desktop.
- Start another collection and let the anchor go offline; confirm one Excel appears under `文档\糖三角\自动导出`.
- Confirm the app does not show a progress UI or popup.
- Confirm save success/failure appears as a log row.
- Confirm stopped-session data remains visible and `导出 Excel` still works.
- Confirm matched gift/comment rows display `[备注名 / 原昵称]`.
- Search for the remark name and confirm the matched rows are found.
- Confirm special-follow matching still does not use nickname/remark as a fallback.

## Rollback Baseline

The current release baseline before this plan is `V26.5.28.1`:

- Installer: `apps/desktop/release/糖三角-V26.5.28.1-安装包.exe`
- SHA256: `AF507DBBD45E2C0E24535288588228303C832098C5DFFFA7CA4D902DC97594AE`

If this version fails, reinstall that baseline and use `docs/subagent-progress.md` to identify touched files and package metadata.

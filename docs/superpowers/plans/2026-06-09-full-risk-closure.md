# Full Risk Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining P1/P2 risks without breaking existing Douyin live capture behavior, then package a date-based release.

**Architecture:** Keep the current desktop-local architecture. Add validation and regression gates around release/config/encoding, introduce full-session aggregate statistics that survive raw-event pruning, and improve export memory behavior while keeping recent event detail for UI.

**Tech Stack:** TypeScript, Node.js, Fastify, better-sqlite3, ExcelJS, React/Vite, Electron/electron-builder, custom Node regression scripts.

---

### Task 1: Backup and Release Rule Guard

**Files:**
- Create backup under `backups/full-risk-closure-YYYYMMDD-HHMMSS`
- Modify: `apps/desktop/scripts/*`
- Test: desktop regression scripts

- [ ] Back up `apps/server/src`, `apps/server/scripts`, `apps/web/src`, `apps/web/scripts`, `apps/desktop/main.mjs`, `apps/desktop/package.json`, root `package.json`, `package-lock.json`, `docs/*.md`, and `apps/desktop/release/*.exe`.
- [ ] Add a release-version regression that reads `VERSION_LOGS[0].version` and `APP_RELEASE_TAG`.
- [ ] Verify both values match and follow `VYY.M.D.N`.
- [ ] For packaging on 2026-06-09, set the first new package to `V26.6.9.1`.

### Task 2: Config and Encoding Gates

**Files:**
- Modify: `apps/server/src/config.ts`
- Add/modify: `apps/server/scripts/*`, `apps/desktop/scripts/*`
- Test: new regression scripts

- [ ] Write failing tests for invalid `HOST`, invalid `PORT`, and invalid path inputs.
- [ ] Add config parsing that rejects invalid values before server listen.
- [ ] Add a Chinese readability regression for installer names, Excel headers, startup log labels, and key docs.
- [ ] Keep desktop production server bound to `127.0.0.1`.

### Task 3: Full-History Aggregates

**Files:**
- Modify: `apps/server/src/db.ts`
- Modify: `apps/server/src/types.ts`
- Modify: `apps/server/src/capture-service.ts`
- Test: server regression scripts

- [ ] Write failing regression showing stats remain correct after raw event pruning.
- [ ] Add session aggregate tables or equivalent persisted counters.
- [ ] Update insert path to aggregate every attempted accepted event before retention pruning.
- [ ] Update stats/query APIs to use full-history aggregates where appropriate.
- [ ] Keep UI recent lists bounded.

### Task 4: Export Memory and Full-History Sheet

**Files:**
- Modify: `apps/server/src/exporter.ts`
- Modify: `apps/server/src/capture-service.ts`
- Test: export regression and pressure scripts

- [ ] Write regression for workbook containing both full-history summary and retained-detail sheets.
- [ ] Reduce memory footprint by batching retained-detail reads where practical.
- [ ] Add pressure script for 10k/50k/100k retained or synthetic events.
- [ ] Report export time, memory delta, and file size.

### Task 5: Collector Type Boundary

**Files:**
- Modify: `apps/server/src/collector.ts`
- Add supporting type/schema modules only where they reduce risk.
- Test: existing collector/server regressions

- [ ] Add explicit payload schemas for page-side event data.
- [ ] Type the boundary between page collection and server normalization.
- [ ] Remove or narrow `@ts-nocheck` only after existing regressions stay green.
- [ ] Avoid rewriting capture behavior.

### Task 6: Docs and Packaging

**Files:**
- Modify: PRD, testing SOP, risk report, test report, iteration log, subagent progress
- Modify: version tags
- Package: `V26.6.9.1`

- [ ] Update docs with the new full-history boundary.
- [ ] Run `npm run test:regression`.
- [ ] Run `npm run audit:security`.
- [ ] Run pressure tests.
- [ ] Run `npm run desktop:pack:fast`.
- [ ] Verify release directory, SHA256, native ABI, and installer naming.

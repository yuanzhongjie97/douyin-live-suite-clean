# Douyin Live Suite

基于 `douyin-live-capture.py` 的产品能力，使用全新技术栈重建的一套完整软件。
当前交付形态以 Windows `.exe` 桌面客户端为主，不再要求在浏览器中单独打开页面。

- 后端：`TypeScript + Fastify + Playwright + SQLite + ExcelJS`
- 前端：`React + Vite`
- 桌面壳：`Electron`
- 运行形态：Windows 客户端 + 本地持久化 + 实时事件流

## 对应原脚本的能力映射

- 直播间监听：通过 Playwright 打开抖音直播页并注入 DOM 观察器
- 事件分类：评论、进场、互动、礼物、运行日志
- 房间信息：直播地址、房间号、标题、主播名、在线状态快照
- 历史归档：SQLite 持久化会话和事件
- 实时展示：SSE 将事件推送到 React 监控台
- 数据导出：按分类导出 Excel 工作簿

## 目录结构

```text
douyin-live-suite/
  apps/
    server/   Fastify + Playwright 后端
    web/      React 监控台
  storage/    运行时数据库和浏览器配置目录（首次运行自动生成）
```

## 启动

```bash
npm install
npm run install:playwright
npm run dev
```

## 桌面客户端

开发启动：

```bash
npm run desktop:dev
```

打包 Windows `.exe`：

```bash
npm run desktop:pack
```

默认产物位置：

`apps/desktop/release/Douyin Live Suite 1.0.0.exe`

## 生产构建

```bash
npm run build
```

后端会在检测到 `apps/web/dist` 存在时自动托管前端静态资源。

## 说明

- 采集方式改成了浏览器 DOM 观察与事件归档，不再依赖原 Python/PyQt 实现。
- 抖音页面结构经常变动，当前选择的是“完整软件架构 + 可运行核心链路”，后续可以继续把选择器和分类规则按实际页面微调。
- 浏览器使用持久化目录，第一次运行时可以在弹出的 Chromium 窗口中完成登录。
- 桌面客户端会在本地拉起内嵌服务并直接展示客户端窗口，用户不需要手动打开浏览器。

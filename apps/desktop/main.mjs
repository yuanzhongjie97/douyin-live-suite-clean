import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from 'electron';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP_NAME = '\u7cd6\u4e09\u89d2';
const APP_RELEASE_TAG = 'V26.6.11.5';
const POPUP_TITLE = '\u795e\u79d8\u4eba';
const DEFAULT_MAIN_WINDOW_SIZE = {
  width: 1480,
  height: 960,
};
const MIN_MAIN_WINDOW_SIZE = {
  width: 840,
  height: 560,
};

let serverRuntime = null;
let mainWindow = null;
let serverUrl = '';
let startupLog = '';
let rendererRequestDiagnosticsAttached = false;

app.setName(APP_NAME);

function getStorageRoot() {
  return path.join(app.getPath('userData'), 'runtime');
}

function ensureStartupLog() {
  const storageRoot = getStorageRoot();
  fs.mkdirSync(storageRoot, { recursive: true });
  startupLog = path.join(storageRoot, 'desktop-startup.log');
}

function getWindowStatePath() {
  return path.join(getStorageRoot(), 'window-state.json');
}

function clampWindowSize(size) {
  return {
    width: Math.max(MIN_MAIN_WINDOW_SIZE.width, Number.parseInt(String(size?.width ?? 0), 10) || DEFAULT_MAIN_WINDOW_SIZE.width),
    height: Math.max(MIN_MAIN_WINDOW_SIZE.height, Number.parseInt(String(size?.height ?? 0), 10) || DEFAULT_MAIN_WINDOW_SIZE.height),
  };
}

function normalizeWindowState(state) {
  const size = clampWindowSize(state);
  const x = Number.parseInt(String(state?.x ?? ''), 10);
  const y = Number.parseInt(String(state?.y ?? ''), 10);
  return {
    ...size,
    ...(Number.isFinite(x) ? { x } : {}),
    ...(Number.isFinite(y) ? { y } : {}),
    alwaysOnTop: Boolean(state?.alwaysOnTop),
    isMaximized: Boolean(state?.isMaximized),
  };
}

function isWindowStateVisible(state) {
  if (!Number.isFinite(state?.x) || !Number.isFinite(state?.y)) {
    return false;
  }

  const bounds = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  };
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const overlapWidth = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapHeight = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return overlapWidth >= 160 && overlapHeight >= 120;
  });
}

function getWindowStateForSave(window) {
  const bounds = window.getNormalBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    alwaysOnTop: window.isAlwaysOnTop(),
    isMaximized: window.isMaximized(),
  };
}

function readWindowState() {
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8');
    return normalizeWindowState(JSON.parse(raw));
  } catch {
    return normalizeWindowState(DEFAULT_MAIN_WINDOW_SIZE);
  }
}

function writeWindowState(state) {
  try {
    fs.mkdirSync(getStorageRoot(), { recursive: true });
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(normalizeWindowState(state), null, 2), 'utf8');
  } catch (error) {
    writeLog(`writeWindowState error: ${formatError(error)}`);
  }
}

function writeLog(message) {
  if (!startupLog) {
    ensureStartupLog();
  }

  fs.appendFileSync(startupLog, `[${new Date().toISOString()}] ${message}\n`);
}

function formatError(error) {
  if (error instanceof Error) {
    return `${error.message}\n${error.stack || ''}`;
  }

  return String(error);
}

function getServerEntry() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), '.bundle', 'server', 'dist', 'index.js');
  }

  return path.resolve(import.meta.dirname, '..', 'server', 'dist', 'index.js');
}

function getWebDistDir() {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), '.bundle', 'web', 'dist');
  }

  return path.resolve(import.meta.dirname, '..', 'web', 'dist');
}

function getAssetPath(name) {
  return app.isPackaged ? path.join(app.getAppPath(), 'assets', name) : path.join(import.meta.dirname, 'assets', name);
}

function getAppIconPath() {
  return getAssetPath('app.ico');
}

function getLoadingPagePath() {
  return getAssetPath('loading.html');
}


function getBundledPlaywrightBrowsersPath() {
  if (!app.isPackaged) {
    return '';
  }

  const searchRoots = [
    process.env.PORTABLE_EXECUTABLE_DIR,
    path.dirname(process.execPath),
  ].filter(Boolean);

  for (const root of searchRoots) {
    const externalChromiumPath = path.join(root, 'Chromium');
    if (fs.existsSync(externalChromiumPath)) {
      return externalChromiumPath;
    }

    const externalPlaywrightPath = path.join(root, 'ms-playwright');
    if (fs.existsSync(externalPlaywrightPath)) {
      return externalPlaywrightPath;
    }
  }

  const bundledPath = path.join(process.resourcesPath, 'ms-playwright');
  return fs.existsSync(bundledPath) ? bundledPath : '';
}

async function findAvailablePort(start = 3100) {
  for (let port = start; port < start + 40; port += 1) {
    const available = await new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(port, '127.0.0.1');
    });

    if (available) {
      return port;
    }
  }

  throw new Error('\u672a\u627e\u5230\u53ef\u7528\u7aef\u53e3\uff0c\u65e0\u6cd5\u542f\u52a8\u684c\u9762\u670d\u52a1\u3002');
}

async function startEmbeddedServer(onProgress = () => undefined) {
  if (serverRuntime) {
    onProgress(86, '服务已就绪');
    return serverRuntime.url;
  }

  onProgress(10, '准备运行目录');
  const storageRoot = getStorageRoot();
  const serverEntry = getServerEntry();
  const webDistDir = getWebDistDir();

  onProgress(22, '检查本地端口');
  const port = await findAvailablePort(3100);

  onProgress(34, '配置采集环境');
  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);
  process.env.DOUYIN_LIVE_SUITE_STORAGE_ROOT = storageRoot;
  process.env.DOUYIN_LIVE_SUITE_WEB_DIST = webDistDir;
  process.env.DOUYIN_LIVE_SUITE_DOCUMENTS_DIR = app.getPath('documents');
  process.env.DOUYIN_LIVE_SUITE_DESKTOP_DIR = app.getPath('desktop');
  process.env.DOUYIN_LIVE_SUITE_PLAYWRIGHT_BROWSERS_PATH =
    getBundledPlaywrightBrowsersPath() || path.join(storageRoot, 'ms-playwright');

  writeLog(`isPackaged=${app.isPackaged}`);
  writeLog(`serverEntry=${serverEntry}`);
  writeLog(`webDistDir=${webDistDir}`);
  writeLog(`storageRoot=${storageRoot}`);
  writeLog(`documentsDir=${process.env.DOUYIN_LIVE_SUITE_DOCUMENTS_DIR}`);
  writeLog(`desktopDir=${process.env.DOUYIN_LIVE_SUITE_DESKTOP_DIR}`);
  writeLog(`playwrightBrowsersPath=${process.env.DOUYIN_LIVE_SUITE_PLAYWRIGHT_BROWSERS_PATH}`);
  writeLog(`port=${port}`);

  onProgress(52, '加载内置服务');
  const serverModule = await import(pathToFileURL(serverEntry).href);
  onProgress(72, '启动本地服务');
  serverRuntime = await serverModule.startServer({
    host: '127.0.0.1',
    port,
  });
  serverUrl = serverRuntime.url;
  writeLog(`serverUrl=${serverUrl}`);
  onProgress(86, '服务启动完成');

  return serverRuntime.url;
}

function createChildWindow(targetUrl) {
  const child = new BrowserWindow({
    width: 760,
    height: 860,
    minWidth: 480,
    minHeight: 520,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    title: POPUP_TITLE,
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  child.once('ready-to-show', () => {
    child.show();
  });
  attachShortcutGuards(child);
  attachRendererDiagnostics(child, 'child');

  child.webContents.on('did-fail-load', (_event, code, desc, url) => {
    writeLog(`child did-fail-load code=${code} desc=${desc} url=${url}`);
  });

  child.loadURL(targetUrl).catch((error) => {
    writeLog(`child load error: ${formatError(error)}`);
  });
}

function attachShortcutGuards(window) {
  window.webContents.on('before-input-event', () => undefined);
}


function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ['www.douyin.com', 'live.douyin.com'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isLocalExportUrl(url) {
  if (!serverUrl) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const server = new URL(serverUrl);
    return parsed.origin === server.origin && parsed.pathname === '/api/export.xlsx';
  } catch {
    return false;
  }
}

function downloadInWindow(window, url) {
  writeLog(`download url: ${url}`);
  window.webContents.downloadURL(url);
}

function truncateLogValue(value, maxLength = 800) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...<truncated>` : text;
}

function writeStartupIdentity() {
  writeLog(`releaseTag=${APP_RELEASE_TAG}`);
  writeLog(`appVersion=${app.getVersion()}`);
  writeLog(`execPath=${process.execPath}`);
  writeLog(`appPath=${app.getAppPath()}`);
  writeLog(`userData=${app.getPath('userData')}`);
  writeLog(`resourcesPath=${process.resourcesPath}`);
}

async function clearRendererHttpCache() {
  try {
    await session.defaultSession.clearCache();
    writeLog('renderer HTTP cache cleared');
  } catch (error) {
    writeLog(`renderer HTTP cache clear error: ${formatError(error)}`);
  }
}

function withDesktopCacheBuster(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('desktopBoot', `${app.getVersion()}-${Date.now()}`);
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function getResponseHeader(headers, name) {
  if (!headers) {
    return '';
  }
  const matchedKey = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  const value = matchedKey ? headers[matchedKey] : undefined;
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

function isRendererDiagnosticUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function attachRendererRequestDiagnostics() {
  if (rendererRequestDiagnosticsAttached) {
    return;
  }
  rendererRequestDiagnosticsAttached = true;

  const filter = { urls: ['http://127.0.0.1:*/*'] };
  session.defaultSession.webRequest.onCompleted(filter, (details) => {
    if (!isRendererDiagnosticUrl(details.url)) {
      return;
    }
    const contentType = getResponseHeader(details.responseHeaders, 'content-type');
    writeLog(
      `renderer request completed type=${details.resourceType} status=${details.statusCode} fromCache=${Boolean(details.fromCache)} mime=${truncateLogValue(contentType, 160)} url=${truncateLogValue(details.url, 360)}`,
    );
  });
  session.defaultSession.webRequest.onErrorOccurred(filter, (details) => {
    if (!isRendererDiagnosticUrl(details.url)) {
      return;
    }
    writeLog(
      `renderer request error type=${details.resourceType} error=${details.error} url=${truncateLogValue(details.url, 360)}`,
    );
  });
}

async function runRendererAssetSelfCheck(baseUrl) {
  try {
    const indexResponse = await fetch(baseUrl, { cache: 'no-store' });
    const indexContentType = indexResponse.headers.get('content-type') ?? '';
    const html = await indexResponse.text();
    writeLog(
      `renderer self-check index status=${indexResponse.status} mime=${truncateLogValue(indexContentType, 160)} length=${html.length} url=${truncateLogValue(baseUrl, 360)}`,
    );

    const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/gu)].map((match) => match[1]);
    if (!assetPaths.length) {
      writeLog('renderer self-check assets none found in index');
      return;
    }

    for (const assetPath of assetPaths) {
      const assetUrl = new URL(assetPath, baseUrl).toString();
      const assetResponse = await fetch(assetUrl, { cache: 'no-store' });
      const assetContentType = assetResponse.headers.get('content-type') ?? '';
      const body = await assetResponse.text();
      const looksLikeHtml = /^\s*</u.test(body);
      writeLog(
        `renderer self-check asset path=${assetPath} status=${assetResponse.status} mime=${truncateLogValue(assetContentType, 160)} length=${body.length} htmlLike=${looksLikeHtml} head=${truncateLogValue(body.slice(0, 120), 160)}`,
      );
    }
  } catch (error) {
    writeLog(`renderer self-check error: ${formatError(error)}`);
  }
}

function inspectRendererState(window, label, reason) {
  if (window.isDestroyed()) {
    return;
  }
  window.webContents
    .executeJavaScript(
      `(() => {
        const root = document.getElementById('root');
        return {
          reason: ${JSON.stringify(reason)},
          url: location.href,
          readyState: document.readyState,
          title: document.title,
          bodyText: document.body?.innerText?.slice(0, 240) ?? '',
          rootChildCount: root?.childElementCount ?? -1,
          rootHtmlLength: root?.innerHTML?.length ?? -1,
          scripts: Array.from(document.scripts).map((item) => ({ src: item.src, type: item.type })),
          stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((item) => ({ href: item.href })),
          assetResources: performance.getEntriesByType('resource')
            .filter((item) => item.name.includes('/assets/'))
            .map((item) => ({
              name: item.name,
              initiatorType: item.initiatorType,
              transferSize: item.transferSize,
              decodedBodySize: item.decodedBodySize,
              duration: Math.round(item.duration)
            }))
        };
      })()`,
      true,
    )
    .then((state) => {
      writeLog(`${label} renderer-inspect ${JSON.stringify(state)}`);
    })
    .catch((error) => {
      writeLog(`${label} renderer-inspect error reason=${reason}: ${formatError(error)}`);
    });
}

function scheduleRendererInspections(window, label, reason) {
  for (const delay of [500, 2000, 5000]) {
    setTimeout(() => inspectRendererState(window, label, `${reason}+${delay}ms`), delay);
  }
}

function attachRendererDiagnostics(window, label) {
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeLog(
      `${label} console-message level=${level} source=${truncateLogValue(sourceId, 240)} line=${line} message=${truncateLogValue(message)}`,
    );
  });

  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    writeLog(`${label} preload-error path=${preloadPath} error=${formatError(error)}`);
  });

  window.webContents.on('dom-ready', () => {
    inspectRendererState(window, label, 'dom-ready');
    scheduleRendererInspections(window, label, 'dom-ready');
  });

  window.webContents.on('did-finish-load', () => {
    writeLog(`${label} did-finish-load url=${truncateLogValue(window.webContents.getURL(), 360)}`);
    scheduleRendererInspections(window, label, 'did-finish-load');
  });
}

function attachWindowHandlers(window) {
  let windowStateTimer = null;
  let moveIdleTimer = null;
  let moveBusy = false;
  const sendMoveState = (moving) => {
    if (window.isDestroyed() || moveBusy === moving) {
      return;
    }
    moveBusy = moving;
    window.webContents.send('desktop:window-move-state', { moving });
  };
  const markWindowMoving = () => {
    sendMoveState(true);
    if (moveIdleTimer) {
      clearTimeout(moveIdleTimer);
    }
    moveIdleTimer = setTimeout(() => {
      moveIdleTimer = null;
      sendMoveState(false);
    }, 220);
  };
  const saveWindowStateSoon = () => {
    if (windowStateTimer) {
      clearTimeout(windowStateTimer);
    }
    windowStateTimer = setTimeout(() => {
      windowStateTimer = null;
      if (!window.isDestroyed()) {
        writeWindowState(getWindowStateForSave(window));
      }
    }, 600);
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalExportUrl(url)) {
      downloadInWindow(window, url);
      return { action: 'deny' };
    }

    if (serverUrl && url.startsWith(serverUrl) && url.includes('popup=mystery')) {
      createChildWindow(url);
      return { action: 'deny' };
    }

    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch((error) => {
        writeLog(`openExternal error: ${formatError(error)}`);
      });
    } else {
      writeLog(`blocked external url: ${url}`);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isLocalExportUrl(url)) {
      event.preventDefault();
      downloadInWindow(window, url);
      return;
    }

    if (serverUrl && url.startsWith(serverUrl)) {
      return;
    }

    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      shell.openExternal(url).catch((error) => {
        writeLog(`will-navigate openExternal error: ${formatError(error)}`);
      });
    } else {
      writeLog(`blocked navigation url: ${url}`);
    }
  });

  window.webContents.on('did-fail-load', (_event, code, desc, url) => {
    writeLog(`main did-fail-load code=${code} desc=${desc} url=${url}`);
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    writeLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });

  window.on('unresponsive', () => {
    writeLog('main window unresponsive');
  });

  window.on('resize', () => {
    markWindowMoving();
    saveWindowStateSoon();
  });
  window.on('move', () => {
    markWindowMoving();
    saveWindowStateSoon();
  });
  window.on('maximize', saveWindowStateSoon);
  window.on('unmaximize', saveWindowStateSoon);

  window.on('close', () => {
    if (windowStateTimer) {
      clearTimeout(windowStateTimer);
      windowStateTimer = null;
    }
    if (moveIdleTimer) {
      clearTimeout(moveIdleTimer);
      moveIdleTimer = null;
    }
    writeWindowState(getWindowStateForSave(window));
  });
}

async function createMainWindow(url = serverUrl) {
  const savedWindowState = readWindowState();

  const windowOptions = {
    ...(isWindowStateVisible(savedWindowState) ? { x: savedWindowState.x, y: savedWindowState.y } : {}),
    width: savedWindowState.width,
    height: savedWindowState.height,
    minWidth: MIN_MAIN_WINDOW_SIZE.width,
    minHeight: MIN_MAIN_WINDOW_SIZE.height,
    resizable: true,
    maximizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#f1f5f9',
    title: APP_NAME,
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      sandbox: true,
    },
  };

  mainWindow = new BrowserWindow(windowOptions);
  attachShortcutGuards(mainWindow);
  attachRendererDiagnostics(mainWindow, 'main');
  if (savedWindowState.isMaximized) {
    mainWindow.maximize();
  }
  mainWindow.setAlwaysOnTop(savedWindowState.alwaysOnTop);

  attachWindowHandlers(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (url) {
    await runRendererAssetSelfCheck(url);
    await mainWindow.loadURL(withDesktopCacheBuster(url));
  } else {
    mainWindow.show();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!url) {
    startEmbeddedServer()
      .then(async (nextUrl) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          await runRendererAssetSelfCheck(nextUrl);
          return mainWindow.loadURL(withDesktopCacheBuster(nextUrl));
        }
        writeLog('main window missing before loading server url');
        return undefined;
      })
      .catch((error) => {
        const message = formatError(error);
        writeLog(`startup error: ${message}`);
        dialog.showErrorBox(APP_NAME, error instanceof Error ? error.message : '\u684c\u9762\u7aef\u542f\u52a8\u5931\u8d25\u3002');
        return shutdownServer().finally(() => app.quit());
      });
  }
}

async function shutdownServer() {
  if (!serverRuntime) {
    return;
  }

  writeLog('closing embedded server');
  await serverRuntime.close();
  serverRuntime = null;
  serverUrl = '';
}

process.on('uncaughtException', (error) => {
  writeLog(`uncaughtException: ${formatError(error)}`);
});

process.on('unhandledRejection', (reason) => {
  writeLog(`unhandledRejection: ${formatError(reason)}`);
});

ipcMain.handle('desktop:get-window-size', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }
  const [width, height] = mainWindow.getSize();
  return { width, height };
});

ipcMain.handle('desktop:set-window-size', (_event, size) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }
  const nextSize = clampWindowSize(size);
  mainWindow.setSize(nextSize.width, nextSize.height);
  writeWindowState(getWindowStateForSave(mainWindow));
  return nextSize;
});

ipcMain.handle('desktop:get-always-on-top', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  return mainWindow.isAlwaysOnTop();
});

ipcMain.handle('desktop:set-always-on-top', (_event, value) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  const nextValue = Boolean(value);
  mainWindow.setAlwaysOnTop(nextValue);
  writeWindowState(getWindowStateForSave(mainWindow));
  return nextValue;
});

app.whenReady().then(async () => {
  ensureStartupLog();

  try {
    writeStartupIdentity();
    attachRendererRequestDiagnostics();
    await clearRendererHttpCache();
    await createMainWindow();
  } catch (error) {
    const message = formatError(error);
    writeLog(`startup error: ${message}`);
    dialog.showErrorBox(APP_NAME, error instanceof Error ? error.message : '\u684c\u9762\u7aef\u542f\u52a8\u5931\u8d25\u3002');
    await shutdownServer().catch(() => undefined);
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  writeLog('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  writeLog('before-quit');
  await shutdownServer().catch((error) => {
    writeLog(`before-quit shutdown error: ${formatError(error)}`);
  });
});

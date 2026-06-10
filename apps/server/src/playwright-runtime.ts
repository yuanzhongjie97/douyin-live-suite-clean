import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import type { BrowserContext, Page } from 'playwright';
import { config } from './config.js';
import type { BrowserInstallState } from './types.js';

process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH || config.playwrightBrowsersPath;

mkdirSync(process.env.PLAYWRIGHT_BROWSERS_PATH, { recursive: true });

const require = createRequire(import.meta.url);
const playwright = require('playwright') as { chromium: unknown };
const playwrightRegistry = require('playwright-core/lib/server/registry/index') as {
  registry: {
    findExecutable(name: string): {
      name: string;
      executablePath(): string | undefined;
    };
    install(executables: Array<unknown>): Promise<void>;
  };
};

export const chromium = playwright.chromium as typeof import('playwright').chromium;
export type { BrowserContext, Page };

let ensuringChromiumPromise: Promise<string> | null = null;
let chromiumInstallState: BrowserInstallState = {
  status: 'idle',
};

function setChromiumInstallState(nextState: BrowserInstallState): void {
  chromiumInstallState = nextState;
}

function updateChromiumInstallState(partialState: Partial<BrowserInstallState>): void {
  chromiumInstallState = {
    ...chromiumInstallState,
    ...partialState,
  };
}

function parseInstallProgressLine(line: string): void {
  const text = String(line).trim();
  if (!text) {
    return;
  }

  const downloadingMatched = text.match(/^Downloading\s+(.+)$/u);
  if (downloadingMatched?.[1]) {
    updateChromiumInstallState({
      status: 'installing',
      phase: /Winldd/iu.test(downloadingMatched[1]) ? 'preparing' : 'downloading',
      message: downloadingMatched[1],
    });
    return;
  }

  const progressMatched = text.match(/\|\s*(\d+)%\s+of\s+([\d.]+\s+MiB)$/u);
  if (progressMatched) {
    updateChromiumInstallState({
      status: 'installing',
      phase: 'downloading',
      progressPercent: Number.parseInt(progressMatched[1], 10),
      totalLabel: progressMatched[2],
      message: `正在下载 Chromium：${progressMatched[1]}%`,
    });
    return;
  }

  if (/downloaded to/iu.test(text)) {
    updateChromiumInstallState({
      status: 'installing',
      phase: 'downloaded',
      progressPercent: 100,
      message: 'Chromium 下载完成，正在准备启动',
    });
  }
}

function getLocalChromiumExecutableCandidates(): string[] {
  const homeDir = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates = new Set<string>();

  for (const value of [
    process.env.CHROME_PATH,
    process.env.CHROMIUM_PATH,
    process.env.DOUYIN_LIVE_SUITE_CHROMIUM_PATH,
  ]) {
    if (value) {
      candidates.add(value);
    }
  }

  if (process.platform === 'win32') {
    for (const value of [
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFiles}\\Chromium\\Application\\chrome.exe`,
      `${programFilesX86}\\Chromium\\Application\\chrome.exe`,
      `${localAppData}\\Chromium\\Application\\chrome.exe`,
      `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ]) {
      candidates.add(value);
    }
  } else if (process.platform === 'darwin') {
    for (const value of [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      `${homeDir}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      `${homeDir}/Applications/Chromium.app/Contents/MacOS/Chromium`,
    ]) {
      candidates.add(value);
    }
  } else {
    for (const value of [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      `${homeDir}/.local/bin/chromium`,
      `${homeDir}/.local/bin/google-chrome`,
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
    ]) {
      candidates.add(value);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

function findLocalChromiumExecutablePath(): string | undefined {
  for (const candidate of getLocalChromiumExecutableCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function getChromiumInstallState(): BrowserInstallState {
  return { ...chromiumInstallState };
}

export async function ensureChromiumExecutablePath(): Promise<string> {
  if (ensuringChromiumPromise) {
    return ensuringChromiumPromise;
  }

  ensuringChromiumPromise = (async () => {
    const { registry } = playwrightRegistry;
    const chromiumExecutable = registry.findExecutable('chromium');
    const existingPath = chromiumExecutable.executablePath();
    if (existingPath && existsSync(existingPath)) {
      setChromiumInstallState({
        status: 'ready',
        phase: 'ready',
        progressPercent: 100,
        message: 'Chromium 已就绪',
      });
      return existingPath;
    }

    const localChromiumPath = findLocalChromiumExecutablePath();
    if (localChromiumPath) {
      setChromiumInstallState({
        status: 'ready',
        phase: 'ready',
        progressPercent: 100,
        message: `已识别本机 Chromium: ${localChromiumPath}`,
      });
      return localChromiumPath;
    }

    const executables: unknown[] = [];
    if (process.platform === 'win32') {
      executables.push(registry.findExecutable('winldd'));
    }
    executables.push(chromiumExecutable);

    setChromiumInstallState({
      status: 'installing',
      phase: 'preparing',
      progressPercent: 0,
      message: '首次启动，正在准备 Chromium',
    });

    const originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      const line = args.map((item) => String(item ?? '')).join(' ');
      parseInstallProgressLine(line);
      originalConsoleLog(...args);
    };

    try {
      await registry.install(executables);
    } finally {
      console.log = originalConsoleLog;
    }

    const installedPath = chromiumExecutable.executablePath();
    if (!installedPath || !existsSync(installedPath)) {
      setChromiumInstallState({
        status: 'error',
        phase: 'error',
        message: 'Chromium 安装失败',
        error: `未找到浏览器可执行文件：${config.playwrightBrowsersPath}`,
      });
      throw new Error(
        `Playwright Chromium 安装失败，未找到浏览器可执行文件。目标目录：${config.playwrightBrowsersPath}`,
      );
    }

    setChromiumInstallState({
      status: 'ready',
      phase: 'ready',
      progressPercent: 100,
      message: 'Chromium 已安装完成',
    });
    return installedPath;
  })();

  try {
    return await ensuringChromiumPromise;
  } catch (error) {
    updateChromiumInstallState({
      status: 'error',
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
      message: 'Chromium 安装失败',
    });
    throw error;
  } finally {
    ensuringChromiumPromise = null;
  }
}

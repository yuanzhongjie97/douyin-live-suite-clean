import { mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(serverRoot, '..', '..', '..');
const homeDir = os.homedir();

const localHosts = ['127.0.0.1', 'localhost', '::1'] as const;
const envSchema = z.object({
  HOST: z.enum(localHosts).default('127.0.0.1'),
  PORT: z
    .string()
    .default('3100')
    .refine((value) => /^\d+$/u.test(value), 'PORT must be an integer')
    .transform((value) => Number(value))
    .refine((value) => value >= 1 && value <= 65535, 'PORT must be between 1 and 65535'),
  DOUYIN_LIVE_SUITE_STORAGE_ROOT: z.string().trim().min(1).optional(),
  DOUYIN_LIVE_SUITE_DB_PATH: z.string().trim().min(1).optional(),
  DOUYIN_LIVE_SUITE_DOCUMENTS_DIR: z.string().trim().min(1).optional(),
  DOUYIN_LIVE_SUITE_DESKTOP_DIR: z.string().trim().min(1).optional(),
  DOUYIN_LIVE_SUITE_PLAYWRIGHT_BROWSERS_PATH: z.string().trim().min(1).optional(),
  DOUYIN_LIVE_SUITE_BROWSER_PROFILE_DIR: z.string().trim().min(1).optional(),
  DOUYIN_LIVE_SUITE_WEB_DIST: z.string().trim().min(1).optional(),
});

export interface ServerConfig {
  appRoot: string;
  host: (typeof localHosts)[number];
  port: number;
  storageRoot: string;
  databasePath: string;
  documentsDir: string;
  desktopDir: string;
  playwrightBrowsersPath: string;
  browserProfileDir: string;
  webDistDir: string;
}

export function parseServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid server configuration: ${details}`);
  }

  const storageRoot = parsed.data.DOUYIN_LIVE_SUITE_STORAGE_ROOT || path.join(appRoot, 'storage');
  return {
    appRoot,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    storageRoot,
    databasePath: parsed.data.DOUYIN_LIVE_SUITE_DB_PATH || path.join(storageRoot, 'douyin-live-suite.db'),
    documentsDir: parsed.data.DOUYIN_LIVE_SUITE_DOCUMENTS_DIR || path.join(homeDir, 'Documents'),
    desktopDir: parsed.data.DOUYIN_LIVE_SUITE_DESKTOP_DIR || path.join(homeDir, 'Desktop'),
    playwrightBrowsersPath:
      parsed.data.DOUYIN_LIVE_SUITE_PLAYWRIGHT_BROWSERS_PATH || path.join(storageRoot, 'ms-playwright'),
    browserProfileDir:
      parsed.data.DOUYIN_LIVE_SUITE_BROWSER_PROFILE_DIR || path.join(storageRoot, 'browser-profile'),
    webDistDir: parsed.data.DOUYIN_LIVE_SUITE_WEB_DIST || path.join(appRoot, 'apps', 'web', 'dist'),
  };
}

export const config = parseServerConfig();

mkdirSync(config.storageRoot, { recursive: true });

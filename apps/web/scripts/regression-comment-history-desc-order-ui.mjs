import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const projectRoot = resolve(process.cwd());
const webDist = join(projectRoot, 'apps', 'web', 'dist');
const sessionId = 'ui-history-desc-order-session';
const baseTime = Date.parse('2026-06-11T12:00:00.000Z');

function makeComment(id) {
  return {
    id,
    uniqueKey: `comment-${id}`,
    sessionId,
    category: 'comment',
    createdAt: new Date(baseTime + id * 1000).toISOString(),
    userName: `用户${id}`,
    userId: `sec_user_${id}`,
    userLink: `https://www.douyin.com/user/sec_user_${id}`,
    message: `comment ${id}`,
    payloadJson: JSON.stringify({
      sourceId: `source-comment-${id}`,
      collectorClientId: `collector-comment-${id}`,
      text: `comment ${id}`,
      rawText: `用户${id}: comment ${id}`,
    }),
  };
}

const newestFirstComments = Array.from({ length: 1000 }, (_, index) => makeComment(1000 - index));

function getContentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

async function startStaticServer() {
  const server = createServer((request, response) => {
    if (!request.url) {
      response.writeHead(404).end();
      return;
    }
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/u, '');
    const filePath = join(webDist, relativePath);
    try {
      const body = readFileSync(filePath);
      response.writeHead(200, { 'Content-Type': getContentType(filePath) });
      response.end(body);
    } catch {
      try {
        const body = readFileSync(join(webDist, 'index.html'));
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    }
  });

  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'static server must listen on a TCP port');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function ensureWebBuild() {
  const result = await new Promise((resolvePromise) => {
    const child = spawn('npm', ['run', 'build:web'], {
      cwd: projectRoot,
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
    child.on('exit', (code) => resolvePromise(code ?? 1));
  });
  assert.equal(result, 0, 'web build must pass before UI regression');
}

await ensureWebBuild();

const { server, url } = await startStaticServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.route('**/api/events/stream', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: '',
    });
  });

  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const path = requestUrl.pathname;
    let payload;
    if (path === '/api/sessions/active') {
      payload = {
        activeSession: {
          id: sessionId,
          url: 'https://live.douyin.com/127874409138',
          status: 'running',
          roomId: '127874409138',
          roomTitle: 'UI history order room',
          hostName: 'host',
          startedAt: new Date(baseTime).toISOString(),
          lastHeartbeatAt: new Date(baseTime).toISOString(),
        },
        room: {
          url: 'https://live.douyin.com/127874409138',
          roomId: '127874409138',
          roomTitle: 'UI history order room',
          hostName: 'host',
          isLive: true,
          lastHeartbeatAt: new Date(baseTime).toISOString(),
        },
      };
    } else if (path === '/api/browser/state') {
      payload = { loginWindowOpen: false, loggedIn: true, profileDisplayName: '测试账号' };
    } else if (path === '/api/stats') {
      payload = {
        sessionId,
        comments: newestFirstComments.length,
        entries: 0,
        interactions: 0,
        gifts: 0,
        giftUnits: 0,
        logs: 0,
        uniqueUsers: newestFirstComments.length,
        topGifts: [],
        activeUsers: [],
      };
    } else if (path === '/api/highlight-users') {
      payload = {
        filePath: '',
        exists: false,
        users: [],
        matchedEvents: [],
        updatedAt: new Date(baseTime).toISOString(),
      };
    } else if (path === '/api/events') {
      const category = requestUrl.searchParams.get('category');
      payload = { items: category === 'comment' ? newestFirstComments : [] };
    } else {
      payload = {};
    }

    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.event-panel-comment .event-row', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.event-panel-comment .event-row').length === 200, null, {
    timeout: 15000,
  });

  const renderedText = await page
    .locator('.event-panel-comment .event-row')
    .evaluateAll((rows) => rows.map((row) => row.textContent || ''));
  assert.equal(renderedText.length, 200, 'UI should render the current 200-comment recent window');
  assert.ok(
    renderedText.some((text) => text.includes('comment 1000')),
    'newest comment from DESC history backfill must stay visible',
  );
  assert.ok(
    renderedText.some((text) => text.includes('comment 801')),
    'oldest item in the visible 200-comment window should be comment 801',
  );
  assert.ok(
    !renderedText.some((text) => /\bcomment 800\b/u.test(text)),
    'older comment 800 must be outside the visible recent window',
  );
  assert.ok(
    !renderedText.some((text) => /\bcomment 1\b/u.test(text)),
    'oldest DESC tail comments must not displace newest comments in the UI',
  );
} finally {
  await browser.close().catch(() => undefined);
  await new Promise((resolvePromise) => server.close(resolvePromise));
}

console.log('UI comment history DESC order regression checks passed');

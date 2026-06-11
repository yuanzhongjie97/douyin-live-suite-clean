import assert from 'node:assert/strict';
import os from 'node:os';
import { DouyinCollector } from '../src/collector.ts';
import { chromium, ensureChromiumExecutablePath } from '../src/playwright-runtime.ts';

const executablePath = await ensureChromiumExecutablePath();
const browser = await chromium.launch({
  executablePath,
  headless: true,
});

const events = [];
const context = await browser.newContext({
  viewport: { width: 900, height: 600 },
});

try {
  await context.exposeBinding('__douyinCollectorBatch', async (_source, payload) => {
    if (Array.isArray(payload)) {
      events.push(...payload);
    }
  });
  await context.exposeBinding('__douyinCollectorDiag', async () => undefined);

  const page = await context.newPage();
  await page.evaluate('window.__name = (target) => target');
  await page.setContent(`
    <main>
      <section class="webcast-chatroom___list"></section>
    </main>
  `);

  const collector = new DouyinCollector('about:blank', os.tmpdir(), {
    onEvents: async () => undefined,
    onRoomUpdate: async () => undefined,
    onStatus: async () => undefined,
    onFatal: async () => undefined,
  }, {
    context,
    page,
    ownsContext: false,
  });
  collector.page = page;

  await collector.installObserver();
  await page.evaluate(() => {
    const root = document.querySelector('.webcast-chatroom___list');
    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.style.cssText = 'display:block;width:420px;height:28px';
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_stop_drain_user">\u505c\u6b62\u8fb9\u754c\u7528\u6237</a>
      <span class="comment-content">\u505c\u6b62\u524d\u6700\u540e\u4e00\u6761\u8bc4\u8bba</span>
    `;
    root.append(row);
  });

  await collector.stop('stop-drain-regression');

  const comment = events.find((event) =>
    event?.category === 'comment' &&
    event.userName === '\u505c\u6b62\u8fb9\u754c\u7528\u6237' &&
    event.text === '\u505c\u6b62\u524d\u6700\u540e\u4e00\u6761\u8bc4\u8bba'
  );
  assert.ok(
    comment,
    `collector.stop must drain pending browser events before cleanup, got ${JSON.stringify(events)}`,
  );

  console.log('collector stop drains pending regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

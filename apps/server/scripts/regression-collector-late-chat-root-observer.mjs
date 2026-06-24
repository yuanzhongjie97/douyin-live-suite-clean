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
const diagnostics = [];
const context = await browser.newContext({
  viewport: { width: 900, height: 600 },
});

try {
  await context.exposeBinding('__douyinCollectorBatch', async (_source, payload) => {
    if (Array.isArray(payload)) {
      events.push(...payload);
    }
  });
  await context.exposeBinding('__douyinCollectorDiag', async (_source, event) => {
    diagnostics.push(event);
  });

  const page = await context.newPage();
  await page.evaluate('window.__name = (target) => target');
  await page.setContent(`
    <main id="app">
      <section class="shell"></section>
    </main>
  `);

  const collector = new DouyinCollector(
    'about:blank',
    os.tmpdir(),
    {
      onEvents: async () => undefined,
      onRoomUpdate: async () => undefined,
      onStatus: async () => undefined,
      onFatal: async () => undefined,
    },
    {
      context,
      page,
      ownsContext: false,
    },
  );
  collector.page = page;

  await collector.installObserver();

  await page.evaluate(() => {
    const shell = document.querySelector('.shell');
    const root = document.createElement('section');
    root.className = 'webcast-chatroom___list';
    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.style.display = 'block';
    row.style.width = '420px';
    row.style.height = '28px';
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_late_root_user">\u7a33\u5b9a\u7528\u6237</a>
      <span class="comment-content">\u8fd9\u6761\u5f88\u5feb\u88ab\u79fb\u9664\u7684\u8bc4\u8bba\u5fc5\u987b\u91c7\u96c6</span>
    `;
    root.appendChild(row);
    shell.appendChild(root);
    window.setTimeout(() => {
      row.remove();
    }, 40);
  });

  await page.waitForTimeout(800);

  const comment = events.find(
    (event) =>
      event?.category === 'comment' &&
      event.userName === '\u7a33\u5b9a\u7528\u6237' &&
      event.text === '\u8fd9\u6761\u5f88\u5feb\u88ab\u79fb\u9664\u7684\u8bc4\u8bba\u5fc5\u987b\u91c7\u96c6',
  );
  assert.ok(
    comment,
    `comments in chat roots created after observer installation must be captured before virtual-list removal; got ${JSON.stringify({
      events,
      diagnostics,
    })}`,
  );

  console.log('collector late chat root observer regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

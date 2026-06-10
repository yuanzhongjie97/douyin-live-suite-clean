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
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_kanfengyun123456789">看风云</a>
      <span class="level-badge">18。</span>
      <span class="comment-content">保持现状。</span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(120);

  const comment = events.find((event) => event?.category === 'comment');
  assert.ok(comment, `expected one comment event, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(comment.userName, '看风云');
  assert.equal(comment.rawText, '看风云 18。 保持现状。');
  assert.equal(
    comment.text,
    '保持现状。',
    `comment body should ignore sibling level/time noise: ${JSON.stringify(comment)}`,
  );

  events.length = 0;
  diagnostics.length = 0;

  await page.evaluate(() => {
    const root = document.querySelector('.webcast-chatroom___list');
    root.replaceChildren();

    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_numeric_comment123456789">数字评论用户</a>
      <span class="comment-content">18。</span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(120);

  const numericComment = events.find((event) => event?.category === 'comment');
  assert.ok(numericComment, `expected one numeric comment event, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(numericComment.userName, '数字评论用户');
  assert.equal(
    numericComment.text,
    '18。',
    `real numeric comment body should be preserved when it is not sibling side noise: ${JSON.stringify(numericComment)}`,
  );

  console.log('comment body noise regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

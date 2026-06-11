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
      <section class="alternate-visible-chat">
        <div data-e2e="comment-item" role="listitem" style="display:block;width:420px;height:28px">
          <a class="nickname" href="https://www.douyin.com/user/sec_visible_leaf_user">中古表时间廊</a>
          <span class="comment-content">@天真恋 我的发言和婷哥的分一样的，一惊一乍</span>
        </div>
      </section>
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
  await page.waitForTimeout(700);

  const comment = events.find((event) =>
    event?.category === 'comment' &&
    event.userName === '中古表时间廊' &&
    event.text === '@天真恋 我的发言和婷哥的分一样的，一惊一乍'
  );
  assert.ok(
    comment,
    `visible leaf comment outside the primary chat root must still be captured, got ${JSON.stringify({ events, diagnostics })}`,
  );

  console.log('comment visible leaf fallback regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

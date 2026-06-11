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
        <div class="external-row-shell" style="display:block;width:420px;height:34px">
          <span data-e2e="comment-item" role="listitem" style="display:inline-block;width:120px;height:24px">
            <a class="nickname" href="https://www.douyin.com/user/sec_split_leaf_user">简白💥</a>：
          </span>
          <span class="comment-content" style="display:inline-block;width:240px;height:24px">[比心] [比心] [比心]</span>
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
    event.userName === '简白💥' &&
    event.text === '[比心] [比心] [比心]'
  );
  assert.ok(
    comment,
    `split visible leaf comment body must be captured from sibling nodes, got ${JSON.stringify({ events, diagnostics })}`,
  );

  console.log('comment sibling body fallback regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

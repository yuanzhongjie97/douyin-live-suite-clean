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
  await page.evaluate(() => {
    const handlers = new Map();
    window.__MESSAGE_INSTANCE__ = {
      on(name, handler) {
        handlers.set(name, handler);
      },
      off(name) {
        handlers.delete(name);
      },
      emit(name, messages) {
        handlers.get(name)?.(messages);
      },
    };
  });
  await page.setContent('<main><section class="webcast-chatroom___list"></section></main>');

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
    window.__MESSAGE_INSTANCE__.emit('GiftMessage', [
      {
        payload: {
          msg_id: 'gift-msg-short-id-1',
          describe: 'gift-user sent rose',
          user: {
            nickname: 'gift-user',
            sec_uid: 'MS4wLjABAAAA-short-id-profile',
            display_id: '83208545044',
            short_id: '83208545044',
            unique_id: 'sec_display_id_001',
          },
          gift: {
            name: 'rose',
          },
          repeat_count: 1,
        },
      },
    ]);
  });

  await page.waitForTimeout(250);

  const gift = events.find((event) => event?.category === 'gift');
  assert.ok(gift, `expected gift message bridge event, got ${JSON.stringify(events)}`);
  assert.equal(gift.displayId, '83208545044', `displayId must cross gift bridge: ${JSON.stringify(gift)}`);
  assert.equal(gift.shortId, '83208545044', `shortId must cross gift bridge: ${JSON.stringify(gift)}`);
  assert.equal(gift.uniqueId, 'sec_display_id_001', `uniqueId must cross gift bridge: ${JSON.stringify(gift)}`);

  console.log('gift message bridge short identity regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

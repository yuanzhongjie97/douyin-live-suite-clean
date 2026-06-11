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
      <a class="nickname" href="https://www.douyin.com/user/sec_rich_mention_target">欢迎官</a>
      <span class="comment-content">
        <span class="mention">@XX</span>
        <span class="short-tail">欢迎</span>
        <span class="rest">来到直播间，今天一起玩</span>
      </span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(220);

  const comment = events.find((event) => event?.category === 'comment' && event.userName === '欢迎官');
  assert.ok(comment, `expected rich mention comment, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    comment.text,
    '@XX 欢迎 来到直播间，今天一起玩',
    `comment body should keep the full visible body, got ${JSON.stringify(comment)}`,
  );
  assert.match(
    comment.rawText,
    /欢迎官.*@XX.*欢迎.*来到直播间/u,
    'rawText should retain the complete visible comment context',
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
      <a class="nickname" href="https://www.douyin.com/user/sec_rich_aria_target">瀹屾暣璇勮鐢ㄦ埛</a>
      <span class="comment-content">
        <span class="short-first">@XX娆㈣繋</span>
        <span class="full-body" aria-label="@XX娆㈣繋 鏉ュ埌鐩存挱闂达紝璁板緱鐐瑰叧娉ㄥ摝">@XX娆㈣繋 鏉ュ埌鐩存挱闂达紝璁板緱鐐瑰叧娉ㄥ摝</span>
      </span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(220);

  const ariaComment = events.find((event) => event?.category === 'comment' && event.userName === '瀹屾暣璇勮鐢ㄦ埛');
  assert.ok(ariaComment, `expected aria rich comment, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    ariaComment.text,
    '@XX娆㈣繋 鏉ュ埌鐩存挱闂达紝璁板緱鐐瑰叧娉ㄥ摝',
    `comment body should prefer the complete body over an earlier short mention tail, got ${JSON.stringify(ariaComment)}`,
  );

  events.length = 0;
  diagnostics.length = 0;

  await page.evaluate(() => {
    const root = document.querySelector('.webcast-chatroom___list');
    root.replaceChildren();

    const fullBody = '@XX\u6B22\u8FCE \u6765\u5230\u76F4\u64AD\u95F4\uFF0C\u8BB0\u5F97\u70B9\u5173\u6CE8\u54E6';
    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_rich_root_aria_target">RootAriaUser</a>
      <span class="comment-content" aria-label="${fullBody}">
        <span class="mention-short">@XX\u6B22\u8FCE</span>
      </span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(220);

  const rootAriaComment = events.find((event) => event?.category === 'comment' && event.userName === 'RootAriaUser');
  assert.ok(rootAriaComment, `expected root aria rich comment, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    rootAriaComment.text,
    '@XX\u6B22\u8FCE \u6765\u5230\u76F4\u64AD\u95F4\uFF0C\u8BB0\u5F97\u70B9\u5173\u6CE8\u54E6',
    `comment body should use the complete root aria-label when child text is a short prefix, got ${JSON.stringify(rootAriaComment)}`,
  );

  events.length = 0;
  diagnostics.length = 0;

  await page.evaluate(() => {
    const root = document.querySelector('.webcast-chatroom___list');
    root.replaceChildren();

    const fullBody = '@XX\u6B22\u8FCE \u771F\u5B9E\u76F4\u64AD\u95F4\u8FD8\u6709\u540E\u7EED\u8BC4\u8BBA';
    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', fullBody);
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_rich_row_aria_target">RowAriaUser</a>
      <span class="comment-content">
        <span class="mention-short">@XX\u6B22\u8FCE</span>
      </span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(220);

  const rowAriaComment = events.find((event) => event?.category === 'comment' && event.userName === 'RowAriaUser');
  assert.ok(rowAriaComment, `expected row aria rich comment, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    rowAriaComment.text,
    '@XX\u6B22\u8FCE \u771F\u5B9E\u76F4\u64AD\u95F4\u8FD8\u6709\u540E\u7EED\u8BC4\u8BBA',
    `comment body should use the complete row aria-label when child text is a short prefix, got ${JSON.stringify(rowAriaComment)}`,
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
      <a class="nickname" href="https://www.douyin.com/user/sec_real_mention_target">\u5A77\u54E5\u5BB6\u7B11\u7B11\uD83C\uDF3B\u2078\u2070\u00B2\u00B3</a>
      <span class="mention">@\u8BF4\u4E0D\u5F97</span>
      <span class="comment-content">\u6211\u4E0A\u4E86\u4E00\u4E2A\u5B9D\u7BB1\u7684\uFF0C\u4F60\u5E2E\u6211\u8865\u4E00\u4E2A</span>
      <span class="emoji" role="img" aria-label="[\u97A0\u8EAC]"></span>
      <span class="emoji" role="img" aria-label="[\u97A0\u8EAC]"></span>
      <span class="emoji" role="img" aria-label="[\u97A0\u8EAC]"></span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(220);

  const realMentionComment = events.find((event) => event?.category === 'comment' && event.userName === '\u5A77\u54E5\u5BB6\u7B11\u7B11\uD83C\uDF3B\u2078\u2070\u00B2\u00B3');
  assert.ok(realMentionComment, `expected real mention comment, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    realMentionComment.text,
    '@\u8BF4\u4E0D\u5F97 \u6211\u4E0A\u4E86\u4E00\u4E2A\u5B9D\u7BB1\u7684\uFF0C\u4F60\u5E2E\u6211\u8865\u4E00\u4E2A [\u97A0\u8EAC] [\u97A0\u8EAC] [\u97A0\u8EAC]',
    `comment body must not drop the leading mention when a shorter content node also exists, got ${JSON.stringify(realMentionComment)}`,
  );

  console.log('comment rich mention body regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

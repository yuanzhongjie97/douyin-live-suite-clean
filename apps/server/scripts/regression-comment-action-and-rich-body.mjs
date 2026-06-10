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
    const rows = [
      ['中国龙', '嘴大能吃'],
      ['用户34525803', '点赞很累 还伤腰'],
      ['阿明哥', '你唱歌也还可以'],
    ];

    for (const [name, body] of rows) {
      const row = document.createElement('div');
      row.className = 'webcast-chatroom___item';
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <a class="nickname" href="https://www.douyin.com/user/sec_${encodeURIComponent(name)}">${name}</a>
        <span class="comment-content">${body}</span>
      `;
      root.append(row);
    }
  });

  await page.waitForTimeout(180);

  const comments = events.filter((event) => event?.category === 'comment');
  const interactions = events.filter((event) => event?.category === 'interaction');
  assert.deepEqual(
    comments.map((event) => [event.userName, event.text]),
    [
      ['中国龙', '嘴大能吃'],
      ['用户34525803', '点赞很累 还伤腰'],
      ['阿明哥', '你唱歌也还可以'],
    ],
    `comment text beginning with 点赞 should stay in comments, got ${JSON.stringify({ events, diagnostics })}`,
  );
  assert.equal(
    interactions.some((event) => event.userName === '用户34525803' || event.text?.includes('点赞很累')),
    false,
    `ordinary comment containing 点赞 must not be classified as interaction: ${JSON.stringify(interactions)}`,
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
      <a class="nickname" href="https://www.douyin.com/user/sec_like_action">\u7528\u6237\u620A</a>
      <span class="comment-content">\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86</span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(180);

  const likeAction = events.find((event) => event?.userName === '\u7528\u6237\u620A');
  assert.ok(likeAction, `expected host like action event, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    likeAction.category,
    'interaction',
    `host like action should be classified as interaction, got ${JSON.stringify(likeAction)}`,
  );
  assert.equal(likeAction.text, '\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86', 'host like action text should be preserved before service formatting');

  events.length = 0;
  diagnostics.length = 0;

  await page.evaluate(() => {
    const root = document.querySelector('.webcast-chatroom___list');
    root.replaceChildren();

    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_recommend_action">\u7528\u6237\u8F9B</a>
      <span class="comment-content">\u63A8\u8350\u4E86\u76F4\u64AD</span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(180);

  const recommendAction = events.find((event) => event?.userName === '\u7528\u6237\u8F9B');
  assert.ok(recommendAction, `expected recommend-live action event, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    recommendAction.category,
    'interaction',
    `recommend-live action should be classified as interaction, got ${JSON.stringify(recommendAction)}`,
  );
  assert.equal(recommendAction.text, '\u63A8\u8350\u4E86\u76F4\u64AD', 'recommend-live action text should be preserved before service formatting');

  events.length = 0;
  diagnostics.length = 0;

  await page.evaluate(() => {
    const root = document.querySelector('.webcast-chatroom___list');
    root.replaceChildren();

    const row = document.createElement('div');
    row.className = 'webcast-chatroom___item';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <a class="nickname" href="https://www.douyin.com/user/sec_yuchen123456789">宇晨</a>
      <span class="mention">@棉花糖</span>
      <span class="emoji" role="img" aria-label="[鼓掌]"></span>
      <span class="emoji" role="img" aria-label="[鼓掌]"></span>
      <span class="comment-content">对</span>
    `;
    root.append(row);
  });

  await page.waitForTimeout(180);

  const richComment = events.find((event) => event?.category === 'comment' && event.userName === '宇晨');
  assert.ok(richComment, `expected rich body comment, got ${JSON.stringify({ events, diagnostics })}`);
  assert.equal(
    richComment.text,
    '@棉花糖 [鼓掌] [鼓掌] 对',
    `comment body should preserve mention and emoji text, got ${JSON.stringify(richComment)}`,
  );

  console.log('comment action word and rich body regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

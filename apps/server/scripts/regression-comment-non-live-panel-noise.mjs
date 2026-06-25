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
      <section class="webcast-chatroom___list">
        <div class="webcast-chatroom___item" role="listitem">
          <a class="nickname" href="https://www.douyin.com/user/sec_real_comment_user">真实用户</a>
          <span class="comment-content">这是一条直播间真实评论</span>
        </div>
      </section>
      <aside class="im-message-panel notification-panel" aria-label="私信通知">
        <div class="messageItem" role="listitem">
          <a href="https://www.douyin.com/user/MS4wLjABAAAAUKDbGzX147adzOIoPEfV6gArcz250ZVd68uSm1O_60E"></a>
          <span>93331592637 04/10 嗨～ 我是养菊花老人，聊聊天吧</span>
        </div>
        <div class="messageItem" role="listitem">
          <a href="https://www.douyin.com/user/MS4wLjABAAAA6LUJyYZXU8CDU8VTDC69Ptshp6QvJpkHNGMD8b5imCr3WPC5pmU_H3WszO5iZB2H"></a>
          <span>3408139397629198 03/22 智能客服接待结束</span>
        </div>
        <div class="messageItem" role="listitem">
          <a href="https://www.douyin.com/user/MS4wLjABAAAA2FjAXeHwF9CQnx8Sk30fis6NiwT1ZO2C20pJNBLmnpd9n2zlpgBbCsyKtePkzUnx"></a>
          <span>3880592140935168 02/05 您对本次服务还满意吗？</span>
        </div>
      </aside>
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

  const comments = events.filter((event) => event?.category === 'comment');
  assert.equal(
    comments.some((event) => event.text === '这是一条直播间真实评论'),
    true,
    `real live comment inside chat root must still be captured, got ${JSON.stringify({ events, diagnostics })}`,
  );
  assert.equal(
    comments.some((event) => /私信|智能客服|服务还满意|养菊花老人/u.test(event.text || event.rawText || '')),
    false,
    `private-message/customer-service rows must not enter comment stream, got ${JSON.stringify({ events, diagnostics })}`,
  );
  assert.equal(
    diagnostics.some((event) => event?.reason === 'digest.non_live_panel_noise'),
    true,
    `collector diagnostics must explain non-live panel drops, got ${JSON.stringify(diagnostics)}`,
  );

  console.log('comment non-live panel noise regression checks passed');
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
}

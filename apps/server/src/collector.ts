// @ts-nocheck
import { mkdirSync } from 'node:fs';
import { chromium, ensureChromiumExecutablePath } from './playwright-runtime.js';
import { buildCommentDiagId, commentDiagnostics } from './comment-diagnostics.js';
import { normalizeCollectorPayloadBatch } from './collector-payload.js';
import { extractRoomIdFromUrl, GIFT_KEYWORDS, normalizeWhitespace } from './utils.js';
const STARTUP_WAIT_MS = 900;
const HEARTBEAT_INTERVAL_MS = 4000;
const PAGE_ACTIVITY_POKE_INTERVAL_MS = 25000;
const BATCH_FLUSH_DELAY_MS = 12;
const BATCH_FLUSH_IMMEDIATE_THRESHOLD = 8;
const GIFT_PENDING_FLUSH_DELAY_MS = 1200;
const NAVIGATION_TIMEOUT_MS = 60000;
const NAVIGATION_READY_TIMEOUT_MS = 12000;
const routedContexts = new WeakSet();
const boundContexts = new WeakSet();
const batchHandlers = new WeakMap();
export class DouyinCollector {
    url;
    profileDir;
    callbacks;
    options;
    context;
  page;
  heartbeatTimer;
  lastPageActivityPokeAt = 0;
  running = false;
    stopping = false;
    restartingPage = false;
    fatalNotified = false;
    ownsContext;
    constructor(url, profileDir, callbacks, options = {}) {
        this.url = url;
        this.profileDir = profileDir;
        this.callbacks = callbacks;
        this.options = options;
        this.ownsContext = options.ownsContext ?? !options.context;
    }
    async start() {
        mkdirSync(this.profileDir, { recursive: true });
        const visibleBrowser = Boolean(this.options.context) || process.env.DOUYIN_LIVE_SUITE_VISIBLE_BROWSER === '1';
        const executablePath = this.options.context ? undefined : await ensureChromiumExecutablePath();
        this.context =
            this.options.context ??
                (await chromium.launchPersistentContext(this.profileDir, {
                    executablePath,
                    headless: !visibleBrowser,
                    serviceWorkers: 'block',
                    viewport: { width: 1440, height: 960 },
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--autoplay-policy=no-user-gesture-required',
                        '--disable-background-networking',
                        '--disable-background-timer-throttling',
                        '--disable-renderer-backgrounding',
                        '--mute-audio',
                    ],
                }));
        if (!routedContexts.has(this.context)) {
            await this.context.route('**/*', async (route) => {
                const type = route.request().resourceType();
                const url = route.request().url().toLowerCase();
                if (
                    type === 'media' ||
                    type === 'font' ||
                    /\.(?:m3u8|m4s|mp4|flv|ts)(?:[?#]|$)/iu.test(url) ||
                    /(?:mime|type)=video/iu.test(url)
                ) {
                    await route.abort().catch(() => undefined);
                    return;
                }
                await route.continue().catch(() => undefined);
            });
            routedContexts.add(this.context);
        }
        batchHandlers.set(this.context, async (payload) => {
            commentDiagnostics.increment('collector.binding.payload_batches');
            commentDiagnostics.increment('collector.binding.payload_items', Array.isArray(payload) ? payload.length : 0);
            if (!Array.isArray(payload)) {
                return;
            }
            const rows = normalizeCollectorPayloadBatch(payload).map((row) => {
                if (row.category === 'comment') {
                    commentDiagnostics.increment('collector.binding.comment_received');
                    if (!row.text && row.rawText) {
                        commentDiagnostics.increment('collector.binding.filtered_empty_text');
                        commentDiagnostics.record({
                            stage: 'collector.binding',
                            reason: 'filtered_empty_text',
                            diagId: buildCommentDiagId(undefined, row),
                            category: row.category,
                            sourceId: row.sourceId,
                            message: row.text,
                            rawText: row.rawText,
                            userName: row.userName,
                            userId: row.userId,
                            userLink: row.userLink,
                        });
                    }
                }
                return row;
            });
            if (rows.length) {
                await this.callbacks.onEvents(rows);
            }
        });
        if (!boundContexts.has(this.context)) {
            const boundContext = this.context;
            await boundContext.exposeBinding('__douyinCollectorBatch', async (_source, payload) => {
                const handler = batchHandlers.get(boundContext);
                if (handler) {
                    await handler(payload);
                }
            });
            await boundContext.exposeBinding('__douyinCollectorDiag', async (_source, event) => {
                try {
                    if (!event || typeof event !== 'object') {
                        return;
                    }
                    const item = event;
                    const reason = String(item.reason ?? 'unknown');
                    const row = {
                        sourceId: normalizeWhitespace(String(item.sourceId ?? '')) || undefined,
                        rawText: normalizeWhitespace(String(item.rawText ?? item.text ?? '')) || undefined,
                        text: normalizeWhitespace(String(item.text ?? item.rawText ?? '')) || undefined,
                        userName: normalizeWhitespace(String(item.userName ?? '')) || undefined,
                        userId: normalizeWhitespace(String(item.userId ?? '')) || undefined,
                        userLink: normalizeWhitespace(String(item.userLink ?? '')) || undefined,
                    };
                    commentDiagnostics.increment(`collector.${reason}`);
                    commentDiagnostics.record({
                        stage: String(item.stage ?? 'collector.digest'),
                        reason,
                        diagId: buildCommentDiagId(undefined, row),
                        category: normalizeWhitespace(String(item.category ?? '')) || undefined,
                        sourceId: row.sourceId,
                        message: row.text,
                        rawText: row.rawText,
                        userName: row.userName,
                        userId: row.userId,
                        userLink: row.userLink,
                        extra: item,
                    });
                } catch {
                    // Diagnostics must never affect collection.
                }
            });
            boundContexts.add(boundContext);
        }
        this.page =
            (this.options.page && !this.options.page.isClosed() ? this.options.page : undefined) ??
                this.context.pages()[0] ??
                (await this.context.newPage());
        this.attachPageCloseHandler(this.page);
        await this.callbacks.onStatus(this.options.context ? 'collector started with current login window' : visibleBrowser ? 'collector started and is monitoring live messages' : 'collector started in background mode');
        await this.navigatePage(this.url);
        await this.page.waitForTimeout(STARTUP_WAIT_MS);
        await this.refreshRoomSnapshot();
        await this.keepPlaybackAlive(true);
        await this.installObserver();
        this.running = true;
        this.heartbeatTimer = setInterval(() => {
            void this.heartbeat();
        }, HEARTBEAT_INTERVAL_MS);
        await this.callbacks.onStatus(this.options.context ? 'collector started with current login window' : visibleBrowser ? 'collector started and is monitoring live messages' : 'collector started in background mode');
    }
    attachPageCloseHandler(page) {
        page.on('close', () => {
            if (this.running && !this.stopping && !this.restartingPage) {
                void this.notifyFatal(new Error('collector window closed unexpectedly'));
            }
        });
    }
    async stop(reason = 'manual') {
        if (this.stopping) {
            return;
        }
        this.stopping = true;
        this.running = false;
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = undefined;
        }
        try {
            if (this.page && !this.page.isClosed()) {
                await this.page.evaluate(() => {
                    const windowAny = window;
                    windowAny.__douyinCollectorCleanup?.();
                });
            }
        }
        catch {
            // Ignore cleanup failures on unstable pages.
        }
        if (this.context) {
            batchHandlers.delete(this.context);
        }
        if (this.context && this.ownsContext) {
            await this.context.close().catch(() => undefined);
        }
        this.context = undefined;
        this.page = undefined;
        this.stopping = false;
        if (reason !== 'manual') {
            await this.callbacks.onStatus(`閲囬泦鍣ㄥ凡鍋滄: ${reason}`, 'warn');
        }
    }
    async heartbeat() {
        if (!this.page || this.page.isClosed()) {
            await this.notifyFatal(new Error('collector browser unavailable'));
            return;
        }
        await this.refreshRoomSnapshot();
        await this.keepPlaybackAlive();
        await this.installObserver();
    }
    async restartCollectorPage(reason = 'manual') {
        if (!this.context || this.stopping || this.restartingPage) {
            return;
        }
        this.restartingPage = true;
        const previousPage = this.page;
        try {
            await this.callbacks.onStatus(reason === 'scheduled' ? '采集页定时重启，释放直播页内存' : '采集页重启中');
            if (previousPage && !previousPage.isClosed()) {
                await previousPage.evaluate(() => {
                    const windowAny = window;
                    windowAny.__douyinCollectorCleanup?.();
                }).catch(() => undefined);
            }
            const nextPage = await this.context.newPage();
            this.attachPageCloseHandler(nextPage);
            this.page = nextPage;
            await this.callbacks.onPageRestart?.(nextPage);
            await this.navigatePage(this.url);
            await this.page.waitForTimeout(STARTUP_WAIT_MS);
            await this.refreshRoomSnapshot();
            await this.keepPlaybackAlive(true);
            await this.installObserver();
            await previousPage?.close().catch(() => undefined);
            await this.callbacks.onStatus('采集页已重启，采集继续');
        }
        finally {
            this.restartingPage = false;
        }
    }
    async keepPlaybackAlive(force = false) {
        if (!this.page || this.page.isClosed()) {
            return;
        }
        const now = Date.now();
        if (!force && now - this.lastPageActivityPokeAt < PAGE_ACTIVITY_POKE_INTERVAL_MS) {
            return;
        }
        await this.page
            .evaluate(() => {
            const windowAny = window;
            if (!windowAny.__douyinCollectorPageActivePatched) {
                const patchGetter = (target, key, getter) => {
                    try {
                        Object.defineProperty(target, key, {
                            configurable: true,
                            get: getter,
                        });
                    }
                    catch {
                        // Ignore readonly descriptor failures on some runtimes.
                    }
                };
                patchGetter(document, 'visibilityState', () => 'visible');
                patchGetter(document, 'hidden', () => false);
                patchGetter(document, 'webkitHidden', () => false);
                patchGetter(document, 'msHidden', () => false);
                patchGetter(document, 'hasFocus', () => () => true);
                patchGetter(window, 'onblur', () => null);
                patchGetter(window, 'onfocus', () => null);
                windowAny.__douyinCollectorPageActivePatched = true;
            }
            const clickResumeButton = () => {
                const selectors = [
                    'button',
                    '[role="button"]',
                    '[data-e2e*="play"]',
                    '[data-e2e*="resume"]',
                    '[class*="play"]',
                    '[class*="resume"]',
                ];
                for (const selector of selectors) {
                    const elements = Array.from(document.querySelectorAll(selector));
                    for (const element of elements) {
                        if (!(element instanceof HTMLElement)) {
                            continue;
                        }
                        const text = String(element.innerText || element.textContent || '')
                            .replace(/\s+/g, ' ')
                            .trim();
                        if (!text) {
                            continue;
                        }
                        if (/(播放|继续|恢复|重试|继续观看|点击继续)/u.test(text)) {
                            try {
                                element.click();
                                return true;
                            }
                            catch {
                                return false;
                            }
                        }
                    }
                }
                return false;
            };
            const visibleCandidates = Array.from(document.querySelectorAll('video, [data-e2e*="player"], [class*="player"], [class*="video"]'))
                .filter((element) => element instanceof HTMLElement)
                .map((element) => element)
                .filter((element) => {
                const rect = element.getBoundingClientRect();
                if (!rect || rect.width < 140 || rect.height < 90) {
                    return false;
                }
                const style = window.getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01;
            })
                .sort((left, right) => {
                const leftRect = left.getBoundingClientRect();
                const rightRect = right.getBoundingClientRect();
                return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
            });
            const target = visibleCandidates[0] ?? document.querySelector('video') ?? document.body;
            try {
                window.focus();
            }
            catch {
                // Ignore focus failures in background mode.
            }
            try {
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('focus'));
                window.dispatchEvent(new Event('pageshow'));
            }
            catch {
                // Ignore synthetic event failures.
            }
            if (target instanceof HTMLElement) {
                try {
                    target.focus({ preventScroll: true });
                }
                catch {
                    // Ignore focus failures.
                }
                const rect = target.getBoundingClientRect();
                const clientX = Math.max(rect.left + 10, Math.min(rect.left + rect.width * 0.18, rect.right - 10));
                const clientY = Math.max(rect.top + 10, Math.min(rect.top + rect.height * 0.22, rect.bottom - 10));
                const eventInit = {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    view: window,
                    clientX,
                    clientY,
                };
                for (const eventName of ['pointerover', 'mouseover', 'mouseenter', 'pointermove', 'mousemove']) {
                    try {
                        target.dispatchEvent(new MouseEvent(eventName, eventInit));
                    }
                    catch {
                        // Ignore synthetic pointer event failures.
                    }
                }
            }
            for (const media of Array.from(document.querySelectorAll('video, audio'))) {
                if (!(media instanceof HTMLMediaElement)) {
                    continue;
                }
                try {
                    media.muted = true;
                    media.defaultMuted = true;
                    media.autoplay = false;
                    media.playsInline = true;
                    media.removeAttribute('autoplay');
                    media.setAttribute('playsinline', 'playsinline');
                    media.pause();
                    media.style.opacity = '0.01';
                    media.style.width = '1px';
                    media.style.height = '1px';
                }
                catch {
                    // Ignore media throttling failures.
                }
            }
            clickResumeButton();
        })
            .catch(() => undefined);
        this.lastPageActivityPokeAt = now;
    }
    async navigatePage(url) {
        if (!this.page || this.page.isClosed()) {
            throw new Error('collector page unavailable');
        }
        const attempts = [
            { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS },
            { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS },
        ];
        let lastError = null;
        for (let index = 0; index < attempts.length; index += 1) {
            const attempt = attempts[index];
            try {
                await this.page.goto(url, attempt);
                await this.page.waitForLoadState('domcontentloaded', {
                    timeout: NAVIGATION_READY_TIMEOUT_MS,
                }).catch(() => undefined);
                return;
            }
            catch (error) {
                lastError = error;
                await this.page.waitForTimeout(900 * (index + 1)).catch(() => undefined);
            }
        }
        throw lastError instanceof Error ? lastError : new Error(`failed to open ${url}`);
    }
    async refreshRoomSnapshot() {
        if (!this.page) {
            return;
        }
        const snapshot = (await this.page.evaluate(() => {
            const normalize = (value) => String(value ?? '')
                .replace(/\s+/g, ' ')
                .trim();
            const currentUrl = location.href;
            const title = normalize(document.title)
                .replace(/_直播.*$/u, '')
                .replace(/- 抖音直播.*$/u, '')
                .trim();
            const roomId = (currentUrl.match(/\/(\d{6,})(?:[/?]|$)/) || [])[1] || '';
            const hostName = normalize(title.replace(/的抖音直播间$/u, ''));
            const bodyText = normalize(document.body?.innerText?.slice(0, 4000) || '');
            const isLive = !/(已结束|暂未开播|直播结束|稍后再来|主播已关闭直播)/u.test(bodyText);
            return {
                url: currentUrl,
                roomId,
                roomTitle: title,
                hostName,
                isLive,
                lastHeartbeatAt: new Date().toISOString(),
            };
        }));
        const room = {
            ...snapshot,
            roomId: snapshot.roomId || extractRoomIdFromUrl(snapshot.url),
        };
        await this.callbacks.onRoomUpdate(room);
    }
    async installObserver() {
        if (!this.page || this.page.isClosed()) {
            return;
        }
        await this.page.evaluate(({ giftKeywords, flushDelayMs, flushImmediateThreshold }) => {
            const windowAny = window;
            if (windowAny.__douyinCollectorInstalled) {
                return;
            }
            windowAny.__douyinCollectorInstalled = true;
            const diag = (stage, reason, payload = {}) => {
                try {
                    const fn = windowAny.__douyinCollectorDiag;
                    if (typeof fn === 'function') {
                        void fn({ stage, reason, ...payload });
                    }
                }
                catch {
                    // Diagnostics must never affect collection.
                }
            };
            const diagPayload = (payload = {}, extra = {}) => ({
                category: payload.category,
                sourceId: payload.sourceId,
                rawText: payload.rawText,
                text: payload.text,
                userName: payload.userName,
                userId: payload.userId,
                userLink: payload.userLink,
                giftName: payload.giftName,
                giftCount: payload.giftCount,
                ...extra,
            });
            const seen = new Map();
            const coarseSeen = new Map();
            const pendingCoarseKeys = new Map();
            const digestedElements = new WeakMap();
            const giftRetryCounts = new WeakMap();
            const giftElementStates = new WeakMap();
            const messageCleanupHandles = [];
            const pending = [];
            const maxPendingCount = 50000;
            let collectorClientSequence = 0;
            let flushTimer = 0;
            let flushing = false;
            let flushAgain = false;
            const cleanupHandles = [];
            let cachedChatRoots = [];
            let cachedChatRootsAt = 0;
                        const genericPatterns = [
                /^\u53D1\u6D88\u606F/u,
                /^\u8BF4\u70B9\u4EC0\u4E48/u,
                /^\u793C\u7269\u5C55\u9986$/u,
                /^\u66F4\u591A\u76F4\u64AD$/u,
                /^\u6253\u5F00\u6296\u97F3$/u,
                /^\u4E0B\u8F7D\u6296\u97F3$/u,
                /^\u4E3B\u64AD\u516C\u544A$/u,
                /^\u5C0F\u65F6\u699C/u,
                /^\u5927\u5BB6\u90FD\u5728\u641C/u,
                /^\u641C\u7D22$/u,
                /^\u901A\u77E5$/u,
                /^\u6295\u7968$/u,
                /^\u5145\u503C$/u,
                /^\u5BA2\u6237\u7AEF/u,
                /^\u9000\u51FA\u76F4\u64AD\u95F4$/u,
            ];
            const genericFragments = [
                '\u521B\u4F5C\u8005\u4E2D\u5FC3',
                '\u521B\u4F5C\u8005\u5B66\u4E60\u4E2D\u5FC3',
                '\u76F4\u64AD\u6570\u636E',
                '\u4F5C\u54C1\u6570\u636E',
                '\u89C6\u9891\u7BA1\u7406',
                '\u53D1\u5E03\u89C6\u9891/\u56FE\u6587',
                '\u526A\u6620\u4E13\u4E1A\u7248',
                '\u4F1A\u5458\u8868\u60C5',
                '\u7ACB\u5373\u767B\u5F55',
                '\u539F\u753B\u53EF\u8BD5\u770B',
                '\u672A\u767B\u5F55\u767B\u5F55\u540E\u5373\u53EF\u89C2\u770B',
                '\u4E0B\u8F7D\u6296\u97F3',
                '\u6D4F\u89C8\u5668\u9650\u5236\u9759\u97F3',
                '\u672C\u573A\u70B9\u8D5E',
                '\u6211\u7684\u559C\u6B22',
                '\u6211\u7684\u6536\u85CF',
                '\u89C2\u770B\u5386\u53F2',
                '\u7A0D\u540E\u518D\u770B',
                '\u6211\u7684\u4F5C\u54C1',
            ];
            const actionWords = [
                '\u8FDB\u5165\u76F4\u64AD\u95F4',
                '\u6765\u4E86',
                '\u52A0\u5165\u76F4\u64AD',
                '\u70B9\u8D5E',
                '\u5173\u6CE8',
                '\u5206\u4EAB',
                '\u7C89\u4E1D\u56E2',
                '\u9001\u51FA',
                '\u8D60\u9001',
                '\u6253\u8D4F',
                '\u6295\u5582',
                '\u9001\u793C',
                '\u793C\u7269',
            ];
            const chatRootSelectors = [
                '.webcast-chatroom___list',
                '.webcast-chatroom',
                '[class*="MessageVirtualList"]',
                '[class*="message-virtual-list"]',
                '[class*="chatroom"]',
            ];
            const chatItemSelectors = [
                '.webcast-chatroom___item',
                '[class*="chatroom___item"]',
                '[class*="ChatMessage"]',
                '[class*="chat-message"]',
                '[class*="messageItem"]',
                '[class*="message-item"]',
                '[class*="commentItem"]',
                '[class*="comment-item"]',
                '[data-e2e*="chat"]',
                '[data-e2e*="comment"]',
                '[role="listitem"]',
                '[data-index]',
                'li',
            ];
            const chatItemSelector = chatItemSelectors.join(',');
            const messageSelectors = [
                '[class*="message"]',
                '[class*="msg"]',
                '[class*="item"]',
                '[class*="chat"]',
                '[class*="comment"]',
                '[data-index]',
                '[role="listitem"]',
                'li',
                'div',
            ];
            const giftSelectors = [
                '[class*="gift"]',
                '[data-e2e*="gift"]',
                '[class*="fansclub"]',
                '[data-e2e*="fans"]',
            ];
            const forcedGiftTokens = Array.from(new Set([...giftKeywords, '\u7C89\u4E1D\u706F\u724C', '\u7C89\u4E1D\u56E2\u706F\u724C', '\u70B9\u4EAE\u7C89\u4E1D\u56E2', '\u5165\u56E2\u5238', '\u4EBA\u6C14\u7968']));
            const giftActionKeywords = ['\u9001\u51FA', '\u8D60\u9001', '\u9001\u7ED9', '\u6253\u8D4F', '\u6295\u5582', '\u9001\u793C'];
            const giftActionWithTargetPattern = '(?:\\u9001\\u51FA\\u4E86?|\\u8D60\\u9001\\u4E86?|\\u9001\\u7ED9(?:\\u4E3B\\u64AD)?|\\u6253\\u8D4F|\\u6295\\u5582)';
            const giftActionPattern = `(?:${giftActionWithTargetPattern}|\\u9001\\s+)`;
            const normalize = (value) => String(value ?? '')
                .replace(/\u200b/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const normalizeUserName = (value) => normalize(String(value ?? '')
                .replace(/^[>@\s]+/u, '')
                .replace(/\s*(?:->|\u2192)\s*$/u, '')
                .replace(/[\uFF1A:\s]+$/u, ''));
            const isPlausibleCommentUserName = (value) => {
                const normalizedValue = normalizeUserName(value);
                if (!normalizedValue) {
                    return false;
                }
                return !/^\d{1,3}$/u.test(normalizedValue);
            };
            const normalizeGiftUserName = (value, giftName = '') => {
                let normalizedValue = normalizeUserName(value).replace(/^(?:\u6807\u6E05|\u9AD8\u6E05|\u8D85\u6E05|\u84DD\u5149|\u539F\u753B)\s+/u, '');
                if (!/\s/u.test(normalizedValue)) {
                    return normalizedValue;
                }
                const parts = normalizedValue.split(/\s+/u).filter(Boolean);
                if (parts.length < 2) {
                    return normalizedValue;
                }
                const trailing = parts[parts.length - 1];
                const leading = parts.slice(0, -1).join('');
                const normalizedLeading = cleanupGiftNameEnhanced(leading);
                if (giftName && normalizedLeading && (giftName.includes(normalizedLeading) || normalizedLeading.includes(giftName) || isGiftNameCandidateEnhanced(normalizedLeading))) {
                    return normalizeUserName(trailing);
                }
                return normalizedValue;
            };
            const hasExplicitGiftCount = (text) => /(?:[xX\u00D7*]\s*\d{1,5}|\u00D7\s*\d{1,5}|\d{1,5}\s*(?:\u8FDE\u51FB|\u9023\u64CA|\u4E2A|\u500B|\u4EFD|\u5F20))/u.test(normalize(text));
            const actualGiftKeywords = [
                '\u7C89\u4E1D\u706F\u724C',
                '\u7C89\u4E1D\u56E2\u706F\u724C',
                '\u70B9\u4EAE\u7C89\u4E1D\u56E2',
                '\u5165\u56E2\u5238',
                '\u4EBA\u6C14\u7968',
                '\u5C0F\u5FC3\u5FC3',
                '\u5609\u5E74\u534E',
                '\u73AB\u7470',
                '\u7231\u5FC3',
                '\u8DD1\u8F66',
                '\u8367\u5149\u68D2',
                '\u793C\u82B1\u7B52',
                '\u68D2\u68D2\u7CD6',
                '\u6296\u97F31\u53F7',
            ];
            const invalidGiftNames = new Set(['\u4E86', '\u9001', '\u9001\u51FA', '\u9001\u51FA\u4E86', '\u8D60\u9001', '\u8D60\u9001\u4E86', '\u9001\u7ED9', '\u6253\u8D4F', '\u6295\u5582', '\u793C\u7269', '\u8FDE\u51FB', 'x', 'X', '\u00D7', '*']);
            invalidGiftNames.add('combo animation');
            const normalizeSpecialGiftPhrase = (text) => {
                const normalizedText = normalize(text);
                if (!normalizedText) {
                    return '';
                }
                if (/\u7C89\u4E1D(?:\u56E2)?\u706F\u724C/u.test(normalizedText) || /\u70B9\u4EAE.*\u7C89\u4E1D\u56E2/u.test(normalizedText)) {
                    return '\u7C89\u4E1D\u706F\u724C';
                }
                if (/\u5165\u56E2\u5238/u.test(normalizedText)) {
                    return '\u5165\u56E2\u5238';
                }
                if (/\u4EBA\u6C14\u7968/u.test(normalizedText)) {
                    return '\u4EBA\u6C14\u7968';
                }
                return '';
            };
            const countMatches = (text, pattern) => {
                const matched = text.match(pattern);
                return matched ? matched.length : 0;
            };
            const toAbsoluteProfileUrl = (value) => {
                const normalizedValue = normalize(value);
                if (!normalizedValue) {
                    return '';
                }
                if (/^https?:\/\//iu.test(normalizedValue)) {
                    return normalizedValue;
                }
                if (normalizedValue.startsWith('//')) {
                    return `https:${normalizedValue}`;
                }
                if (normalizedValue.startsWith('/')) {
                    return `https://www.douyin.com${normalizedValue}`;
                }
                return '';
            };
            const isDirectProfileUrl = (value) => /^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\/[^/?#]+/iu.test(value);
            const isDirectProfileId = (value) => /^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(normalize(value));
            const extractUserIdFromValue = (value) => {
                const normalizedValue = normalize(value);
                if (!normalizedValue) {
                    return '';
                }
                const pathMatched = normalizedValue.match(/\/(?:user|follow)\/([^/?#"'&\s]+)/iu);
                if (pathMatched) {
                    return decodeURIComponent(pathMatched[1]);
                }
                const queryMatched = normalizedValue.match(/[?&](?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId)=([^&#"'&\s]+)/iu);
                if (queryMatched) {
                    return decodeURIComponent(queryMatched[1]);
                }
                const attributeMatched = normalizedValue.match(/(?:^|[\s"'=:{,])(?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId|data-user-id|data-userid|data-sec-user-id|data-sec-uid|data-user-unique-id|data-user-uniqueid|data-open-id|data-openid|data-webcast-uid|uid)["']?\s*[:=]\s*["']?([^"',\s}<>]+)/iu);
                if (attributeMatched) {
                    return decodeURIComponent(attributeMatched[1]);
                }
                if (/^\d{5,}$/u.test(normalizedValue)) {
                    return normalizedValue;
                }
                if (/^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(normalizedValue)) {
                    return normalizedValue;
                }
                return '';
            };
            const reactDataCache = new WeakMap();
            const toPositiveInt = (value) => {
                const numeric = Number.parseInt(String(value ?? ''), 10);
                return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
            };
            const collectReactMessageData = (element) => {
                if (!(element instanceof HTMLElement)) {
                    return {};
                }
                const cached = reactDataCache.get(element);
                if (cached) {
                    return cached;
                }
                const itemRoot = findChatItemRoot(element);
                if (!(itemRoot instanceof HTMLElement)) {
                    const empty = {};
                    reactDataCache.set(element, empty);
                    return empty;
                }
                const result = {
                    payload: undefined,
                    user: undefined,
                    gift: undefined,
                    common: undefined,
                    publicAreaCommon: undefined,
                    userName: '',
                    userId: '',
                    userLink: '',
                    giftName: '',
                    giftCount: 0,
                    sourceId: '',
                };
                const getUserIdentityScore = (user) => {
                    if (!user || typeof user !== 'object') {
                        return 0;
                    }
                    const idCandidate = extractUserIdFromValue(user.sec_uid || user.secUid || user.webcast_uid || user.webcastUid || user.open_id || user.openId || user.user_id || user.userId || user.user_unique_id || user.userUniqueId || user.uid || user.id_str || user.id || user.short_id || user.shortId || user.display_id || user.displayId || user.profile_schema || user.profileSchema || user.schema_url || user.schemaUrl || '');
                    const nameCandidate = normalizeUserName(user.nickname || user.nickName || user.desensitized_nickname || user.desensitizedNickname || user.display_name || user.displayName || user.remark_name || user.remarkName || '');
                    const displayCandidate = normalize(user.display_id || user.displayId || user.unique_id || user.uniqueId || user.user_unique_id || user.userUniqueId || '');
                    let score = 0;
                    if (idCandidate) {
                        score += 4;
                    }
                    if (displayCandidate) {
                        score += 3;
                    }
                    if (nameCandidate) {
                        score += 2;
                    }
                    return score;
                };
                const mergeUserCandidate = (user) => {
                    if (!user || typeof user !== 'object') {
                        return;
                    }
                    if (getUserIdentityScore(user) > getUserIdentityScore(result.user)) {
                        result.user = user;
                    }
                };
                const inspectNestedUserCandidates = (value, depth = 0, seen = new WeakSet()) => {
                    if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) {
                        return;
                    }
                    seen.add(value);
                    mergeUserCandidate(value);
                    const entries = Object.entries(value).slice(0, 140);
                    for (const [key, child] of entries) {
                        if (!child || typeof child !== 'object') {
                            continue;
                        }
                        if (/(^|_)(user|author|sender|owner|member|from|to|profile|common|public|area)(_|$)/iu.test(key) || /(user|uid|sec|profile|schema|author|sender|owner|member|from|to)/iu.test(key) || getUserIdentityScore(child) > 0) {
                            inspectNestedUserCandidates(child, depth + 1, seen);
                        }
                    }
                };
                const nodes = [];
                nodes.push(itemRoot);
                let current = element;
                for (let depth = 0; current instanceof HTMLElement && depth < 8; depth += 1) {
                    if (!nodes.includes(current)) {
                        nodes.push(current);
                    }
                    if (current === itemRoot) {
                        break;
                    }
                    current = current.parentElement;
                }
                nodes.push(...Array.from(itemRoot.querySelectorAll('.v8LY0gZF,.jViERTHR,img.OE08lZUF,[class*="chatroom___content"],span,div')).slice(0, 20).filter((node) => node instanceof HTMLElement && !nodes.includes(node)));
                const inspectProps = (props) => {
                    if (!props || typeof props !== 'object') {
                        return;
                    }
                    const payload = props.message && typeof props.message === 'object' && props.message.payload && typeof props.message.payload === 'object'
                        ? props.message.payload
                        : props.payload && typeof props.payload === 'object'
                            ? props.payload
                            : undefined;
                    if (payload && !result.payload) {
                        result.payload = payload;
                    }
                    if (payload?.user && typeof payload.user === 'object') {
                        mergeUserCandidate(payload.user);
                    }
                    if (props.user && typeof props.user === 'object') {
                        mergeUserCandidate(props.user);
                    }
                    inspectNestedUserCandidates(payload);
                    inspectNestedUserCandidates(props);
                    if (!result.gift && payload?.gift && typeof payload.gift === 'object') {
                        result.gift = payload.gift;
                    }
                    if (!result.gift && props.gift && typeof props.gift === 'object') {
                        result.gift = props.gift;
                    }
                    if (!result.common && payload?.common && typeof payload.common === 'object') {
                        result.common = payload.common;
                    }
                    if (!result.publicAreaCommon && payload?.public_area_common && typeof payload.public_area_common === 'object') {
                        result.publicAreaCommon = payload.public_area_common;
                    }
                };
                const inspectFiber = (fiber) => {
                    let currentFiber = fiber;
                    for (let depth = 0; currentFiber && depth < 12; depth += 1) {
                        inspectProps(currentFiber.pendingProps);
                        inspectProps(currentFiber.memoizedProps);
                        currentFiber = currentFiber.return;
                    }
                };
                for (const node of nodes) {
                    let keys = [];
                    try {
                        keys = Object.keys(node);
                    }
                    catch {
                        keys = [];
                    }
                    for (const key of keys) {
                        if (key.startsWith('__reactProps$')) {
                            inspectProps(node[key]);
                        }
                        if (key.startsWith('__reactFiber$')) {
                            inspectFiber(node[key]);
                        }
                    }
                    if (result.user && result.gift && result.common && result.publicAreaCommon) {
                        break;
                    }
                }
                const secUid = extractUserIdFromValue(result.user?.sec_uid || result.user?.secUid || result.user?.webcast_uid || result.user?.webcastUid || result.user?.open_id || result.user?.openId || result.payload?.sec_uid || result.payload?.secUid || result.payload?.sec_user_id || result.payload?.secUserId || result.payload?.open_id || result.payload?.openId || result.payload?.from_user_id || result.payload?.fromUserId || result.common?.sec_uid || result.common?.secUid || result.common?.user_id || result.publicAreaCommon?.default_click_schema_url || result.publicAreaCommon?.schema_url || result.publicAreaCommon?.schemaUrl || '');
                const numericId = extractUserIdFromValue(result.user?.id || result.user?.id_str || result.user?.uid || result.user?.user_id || result.user?.userId || result.user?.short_id || result.user?.shortId || result.payload?.user_id || result.payload?.userId || result.payload?.from_user_id || result.payload?.fromUserId || result.common?.user_id || '');
                const displayId = normalize(result.user?.display_id || result.user?.displayId || result.user?.unique_id || result.user?.uniqueId || result.user?.user_unique_id || result.user?.userUniqueId || '');
                result.userName = normalizeUserName(result.user?.nickname || result.user?.nickName || result.user?.desensitized_nickname || result.user?.desensitizedNickname || result.user?.display_name || result.user?.displayName || displayId || result.user?.remark_name || result.user?.remarkName || '');
                result.userId = displayId || secUid || numericId;
                const defaultClickSchemaUrl = toAbsoluteProfileUrl(result.publicAreaCommon?.default_click_schema_url || result.publicAreaCommon?.schema_url || result.publicAreaCommon?.schemaUrl || result.payload?.schema_url || result.payload?.schemaUrl || result.payload?.profile_schema || result.payload?.profileSchema || '');
                result.userLink = isDirectProfileUrl(defaultClickSchemaUrl) ? defaultClickSchemaUrl : '';
                if (!result.userLink && isDirectProfileId(secUid)) {
                    result.userLink = `https://www.douyin.com/user/${encodeURIComponent(secUid)}`;
                }
                result.sourceId = normalize(result.payload?.msg_id || result.payload?.msgId || result.payload?.message_id || result.payload?.messageId || result.payload?.id || result.payload?.id_str || result.payload?.idStr || result.common?.msg_id || result.common?.msgId || result.common?.message_id || result.common?.messageId || result.publicAreaCommon?.msg_id || result.publicAreaCommon?.msgId || result.publicAreaCommon?.message_id || result.publicAreaCommon?.messageId || '');
                const structuredGiftNameCandidates = [
                    result.gift?.name,
                    result.gift?.describe,
                    result.gift?.gift_name,
                    result.gift?.giftName,
                    result.gift?.display_name,
                    result.gift?.displayName,
                    result.gift?.title,
                    result.gift?.label,
                    result.payload?.gift_name,
                    result.payload?.giftName,
                    result.payload?.display_name,
                    result.payload?.displayName,
                    result.payload?.describe,
                    result.payload?.combo_hint,
                    result.payload?.comboHint,
                    result.publicAreaCommon?.gift_name,
                    result.publicAreaCommon?.giftName,
                    result.publicAreaCommon?.display_content,
                    result.publicAreaCommon?.displayContent,
                ]
                    .map((item) => cleanupGiftNameEnhanced(String(item ?? '')))
                    .filter(Boolean);
                result.giftName =
                    structuredGiftNameCandidates.find((item) => isGiftNameCandidateEnhanced(item)) ||
                        structuredGiftNameCandidates[0] ||
                        '';
                result.giftCount = Math.max(toPositiveInt(result.payload?.repeat_count), toPositiveInt(result.payload?.repeatCount), toPositiveInt(result.payload?.combo_count), toPositiveInt(result.payload?.comboCount), toPositiveInt(result.payload?.group_count), toPositiveInt(result.payload?.groupCount), toPositiveInt(result.payload?.total_count), toPositiveInt(result.payload?.totalCount), toPositiveInt(result.payload?.count), toPositiveInt(result.gift?.combo_count), toPositiveInt(result.gift?.comboCount), toPositiveInt(result.gift?.count), 0);
                reactDataCache.set(element, result);
                return result;
            };
            const collectUserMeta = (element) => {
                const reactData = collectReactMessageData(element);
                const nodes = [];
                let current = element;
                for (let depth = 0; current instanceof HTMLElement && depth < 9; depth += 1) {
                    nodes.push(current);
                    current = current.parentElement;
                }
                const anchorSelector = 'a[href], [href], [data-user-id], [data-userid], [data-sec-user-id], [data-sec-uid], [data-user-unique-id], [data-user-uniqueid], [data-open-id], [data-openid], [data-webcast-uid], [data-e2e*="user"], [data-e2e*="nickname"], [data-e2e*="gift"], [class*="gift"], [class*="Gift"], [class*="user"], [class*="User"], [class*="avatar"], [class*="Avatar"]';
                nodes.push(...Array.from(element.querySelectorAll(anchorSelector)).slice(0, 48));
                let userLink = reactData.userLink || '';
                let userId = reactData.userId || '';
                for (const node of nodes) {
                    if (!(node instanceof HTMLElement)) {
                        continue;
                    }
                    const hrefValue = node instanceof HTMLAnchorElement ? node.href : node.getAttribute('href') || '';
                    const absoluteHref = toAbsoluteProfileUrl(hrefValue);
                    if (absoluteHref && /\/(?:user|follow)\//iu.test(absoluteHref)) {
                        userLink = userLink || absoluteHref;
                        userId = userId || extractUserIdFromValue(absoluteHref);
                    }
                    for (const attribute of Array.from(node.attributes)) {
                        const attributeName = attribute.name.toLowerCase();
                        const attributeValue = attribute.value;
                        if (!attributeValue || !/(href|user|uid|sec|profile|author|anchor|modal)/iu.test(attributeName)) {
                            continue;
                        }
                        const absoluteLink = toAbsoluteProfileUrl(attributeValue);
                        if (absoluteLink && /\/(?:user|follow)\//iu.test(absoluteLink)) {
                            userLink = userLink || absoluteLink;
                            userId = userId || extractUserIdFromValue(absoluteLink);
                        }
                        const extractedId = extractUserIdFromValue(attributeValue);
                        if (extractedId) {
                            userId = userId || extractedId;
                        }
                    }
                    if (!userId) {
                        const outerHtmlId = extractUserIdFromValue(node.outerHTML || '');
                        if (outerHtmlId) {
                            userId = outerHtmlId;
                        }
                    }
                    if (userLink && userId) {
                        break;
                    }
                }
                if (!isDirectProfileUrl(userLink)) {
                    userLink = '';
                }
                if (!userLink && isDirectProfileId(userId)) {
                    userLink = `https://www.douyin.com/user/${encodeURIComponent(userId)}`;
                }
                return { userLink, userId };
            };const collectTextFragments = (element, limit = 16) => {
                const fragments = [];
                const nodes = [element, ...Array.from(element.querySelectorAll('[title],[aria-label],img[alt],strong,b,span'))].slice(0, limit);
                for (const node of nodes) {
                    let candidate = '';
                    if (node instanceof HTMLImageElement) {
                        candidate = node.alt;
                    }
                    else if (node instanceof HTMLElement) {
                        candidate =
                            node.getAttribute('title') ||
                                node.getAttribute('aria-label') ||
                                node.innerText ||
                                node.textContent ||
                                '';
                    }
                    const normalized = normalize(candidate);
                    if (!normalized || fragments.includes(normalized)) {
                        continue;
                    }
                    fragments.push(normalized);
                }
                return fragments;
            };
            const collectOrderedVisibleText = (element, maxNodes = 160) => {
                if (!(element instanceof HTMLElement)) {
                    return '';
                }
                const fragments = [];
                let visited = 0;
                const visit = (node) => {
                    if (!node || visited >= maxNodes) {
                        return;
                    }
                    visited += 1;
                    if (node.nodeType === Node.TEXT_NODE) {
                        const textValue = normalize(node.textContent || '');
                        if (textValue) {
                            fragments.push(textValue);
                        }
                        return;
                    }
                    if (!(node instanceof HTMLElement)) {
                        return;
                    }
                    if (node instanceof HTMLImageElement) {
                        const altText = normalize(node.alt || node.getAttribute('aria-label') || node.getAttribute('title') || '');
                        if (altText) {
                            fragments.push(altText);
                        }
                        return;
                    }
                    if (node.getAttribute('role') === 'img') {
                        const labelText = normalize(node.getAttribute('aria-label') || node.getAttribute('title') || '');
                        if (labelText) {
                            fragments.push(labelText);
                        }
                        return;
                    }
                    if (node.tagName === 'BR') {
                        fragments.push(' ');
                        return;
                    }
                    for (const child of Array.from(node.childNodes)) {
                        visit(child);
                        if (visited >= maxNodes) {
                            break;
                        }
                    }
                };
                visit(element);
                return normalize(fragments.join(' '));
            };
            const visibleText = (element) => {
                if (!(element instanceof HTMLElement)) {
                    return '';
                }
                const ordered = collectOrderedVisibleText(element);
                if (ordered) {
                    return ordered;
                }
                const direct = normalize(element.innerText || element.textContent || '');
                if (direct) {
                    return direct;
                }
                return normalize(collectTextFragments(element, 8).join(' '));
            };
            const skip = (text) => {
                if (!text || text.length < 2 || text.length > 240) {
                    return true;
                }
                if (genericPatterns.some((pattern) => pattern.test(text))) {
                    return true;
                }
                if (genericFragments.some((fragment) => text.includes(fragment))) {
                    return true;
                }
                if (/^(?:\d+(?:\.\d+)?涓?)$/u.test(text)) {
                    return true;
                }
                const compact = text.replace(/\s+/gu, '');
                const statLabels = ['评论数', '评论', '进场数', '进场', '互动数', '互动', '送礼数', '送礼', '礼物件数', '唯一用户', '在线人数'];
                const statTokenPattern = /(?:评论数|评论|进场数|进场|互动数|互动|送礼数|送礼|礼物件数|唯一用户|在线人数)\s*[:：]?\s*\d+/gu;
                const statTokenCount = text.match(statTokenPattern)?.length ?? 0;
                const statLabelHits = statLabels.filter((label) => compact.includes(label)).length;
                const compactResidue = compact
                    .replace(/(?:评论数|评论|进场数|进场|互动数|互动|送礼数|送礼|礼物件数|唯一用户|在线人数)/gu, '')
                    .replace(/[0-9０-９:+：|｜/、，,。.\-_=~·•●◆【】\[\]()（）<>《》]/gu, '');
                if (statTokenCount >= 2) {
                    return true;
                }
                if (statLabelHits >= 2 && compact.length <= 64 && compactResidue.length <= 8) {
                    return true;
                }
                if (/^(?:(?:评论数|评论|进场数|进场|互动数|互动|送礼数|送礼|礼物件数|唯一用户|在线人数)\s*[:：]?\s*\d+\s*)+$/u.test(text)) {
                    return true;
                }
                return false;
            };
            const getLink = (element) => {
                return collectUserMeta(element).userLink;
            };
            const extractUserId = (link) => {
                return extractUserIdFromValue(link);
            };
            const findChatRoots = () => {
                const now = Date.now();
                cachedChatRoots = cachedChatRoots.filter((node) => node instanceof HTMLElement && node.isConnected);
                if (cachedChatRoots.length && now - cachedChatRootsAt < 3000) {
                    return cachedChatRoots;
                }
                const roots = [];
                for (const selector of chatRootSelectors) {
                    for (const node of Array.from(document.querySelectorAll(selector))) {
                        if (node instanceof HTMLElement && !roots.includes(node)) {
                            roots.push(node);
                        }
                    }
                }
                cachedChatRoots = roots;
                cachedChatRootsAt = now;
                return roots;
            };
            const findChatItemRoot = (element) => {
                if (!(element instanceof HTMLElement)) {
                    return element;
                }
                try {
                    return element.closest(chatItemSelector) || element;
                }
                catch {
                    return element.closest('.webcast-chatroom___item') || element;
                }
            };
            const isInsideChatRoot = (element) => Boolean(element.closest(chatRootSelectors.join(',')));
            const hasExplicitGiftText = (text) => /(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001\u793C)(?:\s|[xX\u00D7*]|\d|$)/u.test(text) ||
                /^.{1,24}?(?:[\uFF1A:]\s*|\s+)\u9001\s+\S+/u.test(text) ||
                /(?:\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968)/u.test(text);
            const containsGiftSignal = (text) => /(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001\u793C)(?:\s|[xX\u00D7*]|\d|$)/u.test(text) ||
                /^.{1,24}?(?:[\uFF1A:]\s*|\s+)\u9001\s+\S+/u.test(text) ||
                /(?:\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968)/u.test(text);
            const looksLikeInteractionText = (text) => {
                const normalizedText = normalize(text);
                if (!normalizedText) {
                    return false;
                }
                const colonAction = normalizedText.match(/^[^:\uFF1A]{1,24}[:\uFF1A]\s*(.+)$/u)?.[1];
                const actionText = colonAction ? normalize(colonAction) : normalizedText;
                return /^(?:\u70B9\u8D5E|\u5173\u6CE8|\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u63A8\u8350\u4E86\u76F4\u64AD|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206)$/u.test(actionText) ||
                    /^.{1,24}?\s*(?:\u70B9\u8D5E|\u5173\u6CE8|\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u63A8\u8350\u4E86\u76F4\u64AD|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206)$/u.test(normalizedText);
            };
            const looksLikeGiftElement = (element) => giftSelectors.some((selector) => {
                try {
                    return Boolean(element.matches(selector) || element.closest(selector));
                }
                catch {
                    return false;
                }
            });
            const classify = (text, element, reactData) => {
                if (reactData?.gift || reactData?.giftName || containsGiftSignal(text) || (looksLikeGiftElement(element) && hasExplicitGiftText(text))) {
                    return 'gift';
                }
                if (/(?:\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD)/u.test(text)) {
                    return 'entry';
                }
                if (looksLikeInteractionText(text)) {
                    return 'interaction';
                }
                return 'comment';
            };
            const parseGiftCount = (text) => {
                const patterns = [
                    /[xX\u00D7*]\s*(\d{1,5})/gu,
                    /(\d{1,5})\s*(?:\u8FDE\u51FB|\u9023\u64CA)/gu,
                    /(\d{1,5})\s*(?:\u4E2A|\u500B|\u4EFD|\u5F20)/gu,
                ];
                for (const pattern of patterns) {
                    const matches = Array.from(text.matchAll(pattern));
                    const matched = matches[matches.length - 1];
                    const parsed = matched ? Number(matched[1]) : 0;
                    if (Number.isFinite(parsed) && parsed > 0) {
                        return parsed;
                    }
                }
                return 1;
            };
                        const cleanupGiftName = (text) => normalize(text
                .replace(/^(?:\u9001\u793C|\u793C\u7269)[:\uFF1A]?\s*/iu, '')
                .replace(new RegExp(`^.{1,24}?${giftActionPattern}\\s*`, 'u'), '')
                .replace(/[xX\u00D7*]\s*\d{1,5}\s*$/u, '')
                .replace(/\d{1,5}\s*\u8FDE\u51FB$/u, '')
                .replace(/\d{1,5}\s*(?:\u4E2A|\u4EFD|\u5F20)$/u, '')
                .replace(/^\s*->\s*/u, '')
                .replace(/^[\uFF1A:>\-\s]+/u, '')
                .replace(/[\uFF1A:\-\s]+$/u, ''));const isGiftNameCandidate = (text) => {
                const normalizedText = normalize(text);
                if (!normalizedText || normalizedText.length > 48) {
                    return false;
                }
                if (genericPatterns.some((pattern) => pattern.test(normalizedText))) {
                    return false;
                }
                if (genericFragments.some((fragment) => normalizedText.includes(fragment))) {
                    return false;
                }
                if (actionWords.some((keyword) => normalizedText.includes(keyword))) {
                    return false;
                }
                if (/^\d{1,5}$/u.test(normalizedText)) {
                    return false;
                }
                return true;
            };
            const parseGift = (text, element) => {
                const normalizedText = normalize(text);
                const giftNodes = Array.from(element.querySelectorAll(giftSelectors.join(','))).slice(0, 8);
                const candidateSet = new Set([normalizedText]);
                for (const node of giftNodes) {
                    for (const fragment of collectTextFragments(node, 8)) {
                        candidateSet.add(fragment);
                    }
                }
                for (const fragment of collectTextFragments(element, 24)) {
                    candidateSet.add(fragment);
                }
                const candidates = Array.from(candidateSet);
                const overallLooksLikeGift = containsGiftSignal(normalizedText) || looksLikeGiftElement(element);
                let giftName = '';
                let giftCount = parseGiftCount(normalizedText);
                for (const candidate of candidates) {
                    if (!candidate || candidate.length > 120) {
                        continue;
                    }
                    const cleaned = cleanupGiftName(candidate);
                    if (overallLooksLikeGift && isGiftNameCandidate(cleaned)) {
                        giftName = cleaned;
                        giftCount = Math.max(giftCount, parseGiftCount(candidate));
                        break;
                    }
                    if (!containsGiftSignal(candidate) && !/(\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968)/u.test(candidate)) {
                        continue;
                    }
                    if (isGiftNameCandidate(cleaned)) {
                        giftName = cleaned;
                        giftCount = Math.max(giftCount, parseGiftCount(candidate));
                        break;
                    }
                }
                return {
                    giftName: giftName || undefined,
                    giftCount,
                };
            };
                        const parseGiftCountEnhanced = (text) => {
                const normalizedText = normalize(text);
                const patterns = [
                    /[xX\u00D7*]\s*(\d{1,5})/gu,
                    /(\d{1,5})\s*(?:\u8FDE\u51FB|\u9023\u64CA)/gu,
                    /(\d{1,5})\s*(?:\u4E2A|\u500B|\u4EFD|\u5F20)/gu,
                ];
                for (const pattern of patterns) {
                    const matches = Array.from(normalizedText.matchAll(pattern));
                    const matched = matches[matches.length - 1];
                    const parsed = matched ? Number(matched[1]) : 0;
                    if (Number.isFinite(parsed) && parsed > 0) {
                        return parsed;
                    }
                }
                return 1;
            };
            const cleanupGiftNameEnhanced = (text) => {
                const directSpecial = normalizeSpecialGiftPhrase(text);
                if (directSpecial) {
                    return directSpecial;
                }
                const cleaned = normalize(text
                    .replace(/^(?:\u9001\u793C|\u793C\u7269)[:\uFF1A]?\s*/iu, '')
                    .replace(new RegExp(`^.{1,24}?${giftActionPattern}\\s*`, 'u'), '')
                    .replace(/[xX\u00D7*]\s*\d{1,5}\s*$/u, '')
                    .replace(/\d{1,5}\s*\u8FDE\u51FB$/u, '')
                    .replace(/\d{1,5}\s*(?:\u4E2A|\u4EFD|\u5F20)$/u, '')
                    .replace(/\s+\d+\u94BB$/u, '')
                    .replace(/\s+\u8FDE\u51FB.*$/u, '')
                    .replace(/\s+\u9001\u7ED9\u4E3B\u64AD.*$/u, '')
                    .replace(/^[\uFF1A:>\-\s]+/u, '')
                    .replace(/[\uFF1A:\-\s]+$/u, ''));
                return normalizeSpecialGiftPhrase(cleaned) || cleaned;
            };
            const isGiftNameCandidateEnhanced = (text) => {
                const normalizedText = normalize(text);
                if (!normalizedText || normalizedText.length < 2 || normalizedText.length > 48) {
                    return false;
                }
                if (invalidGiftNames.has(normalizedText)) {
                    return false;
                }
                if (/combo animation/iu.test(normalizedText)) {
                    return false;
                }
                if (/^[\[{【（(].*[\]】）)]$/u.test(normalizedText)) {
                    return false;
                }
                if (/^(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9|\u6253\u8D4F|\u6295\u5582|\u793C\u7269|\u8FDE\u51FB)$/u.test(normalizedText)) {
                    return false;
                }
                if (/^[xX\u00D7*]+$/u.test(normalizedText) || /^[\d\s]+$/u.test(normalizedText) || /^[\uFF1A:>\-\s]+$/u.test(normalizedText)) {
                    return false;
                }
                if (genericPatterns.some((pattern) => pattern.test(normalizedText))) {
                    return false;
                }
                if (genericFragments.some((fragment) => normalizedText.includes(fragment))) {
                    return false;
                }
                if (actionWords.some((keyword) => normalizedText.includes(keyword))) {
                    return false;
                }
                return true;
            };
            const extractGiftPayloadFromText = (text) => {
                const normalizedText = normalize(text);
                const patterns = [
                    new RegExp(`^(.{1,24})[\\uFF1A:]\\s*${giftActionPattern}(.+)$`, 'u'),
                    new RegExp(`^(.{1,24})\\s+${giftActionPattern}(.+)$`, 'u'),
                    new RegExp(`^(.{1,24})\\s+((?!${giftActionWithTargetPattern})(?:[^\\s]+(?:\\s+[^xX\\u00D7*\\d][^\\s]*)*))\\s*(?:[xX\\u00D7*]\\s*\\d{1,5}|\\d{1,5}\\s*(?:\\u8FDE\\u51FB|\\u9023\\u64CA|\\u4E2A|\\u500B|\\u4EFD|\\u5F20))$`, 'u'),
                    /^(.{1,24})[:\uFF1A]\s*(.+)$/u,
                    /^(.{1,24})(?:[\uFF1A:]\s*|\s+)(\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968.*)$/u,
                ];
                for (const [index, pattern] of patterns.entries()) {
                    const matched = normalizedText.match(pattern);
                    if (!matched) {
                        continue;
                    }
                    const candidateText = normalize(matched[2]);
                    if (index === 3 &&
                        !hasExplicitGiftText(candidateText) &&
                        !actualGiftKeywords.some((keyword) => candidateText.includes(keyword))) {
                        continue;
                    }
                    return {
                        userName: normalizeUserName(matched[1]),
                        giftName: cleanupGiftNameEnhanced(candidateText),
                        giftCount: parseGiftCountEnhanced(normalizedText),
                    };
                }
                return {
                    userName: '',
                    giftName: '',
                    giftCount: parseGiftCountEnhanced(normalizedText),
                };
            };
            const scoreGiftCandidateEnhanced = (candidate, fullText, userName) => {
                let score = 0;
                if (!candidate) {
                    return score;
                }
                if (fullText.includes(candidate)) {
                    score += 2;
                }
                if (candidate.length >= 2 && candidate.length <= 16) {
                    score += 2;
                }
                if (/[\u4E00-\u9FFF]/u.test(candidate)) {
                    score += 2;
                }
                if (actualGiftKeywords.some((keyword) => candidate.includes(keyword))) {
                    score += 4;
                }
                if (userName && candidate === userName) {
                    score -= 6;
                }
                if (/[\uFF1A:]/u.test(candidate)) {
                    score -= 3;
                }
                return score;
            };
            const parseGiftEnhanced = (text, element) => {
                const normalizedText = normalize(text);
                const reactData = collectReactMessageData(element);
                const structuredGift = extractGiftPayloadFromText(normalizedText);
                const describeText = normalize(reactData.common?.describe || reactData.payload?.common?.describe || reactData.payload?.describe || '');
                const describeGift = describeText
                    ? extractGiftPayloadFromText(describeText)
                    : {
                        userName: '',
                        giftName: '',
                        giftCount: 0,
                    };
                const giftNodes = Array.from(element.querySelectorAll(giftSelectors.join(','))).slice(0, 8);
                const candidateSet = new Set([normalizedText]);
                const trustedCandidateSet = new Set();
                if (structuredGift.giftName) {
                    candidateSet.add(structuredGift.giftName);
                }
                if (describeText) {
                    candidateSet.add(describeText);
                    trustedCandidateSet.add(describeText);
                }
                if (describeGift.giftName) {
                    candidateSet.add(describeGift.giftName);
                    trustedCandidateSet.add(describeGift.giftName);
                }
                if (reactData.giftName) {
                    candidateSet.add(reactData.giftName);
                    trustedCandidateSet.add(reactData.giftName);
                }
                for (const node of giftNodes) {
                    for (const fragment of collectTextFragments(node, 8)) {
                        candidateSet.add(fragment);
                        trustedCandidateSet.add(fragment);
                    }
                }
                for (const fragment of collectTextFragments(element, 24)) {
                    candidateSet.add(fragment);
                }
                const candidates = Array.from(candidateSet);
                const overallLooksLikeGift = containsGiftSignal(normalizedText) || looksLikeGiftElement(element);
                const actionOnlyText = new RegExp(`${giftActionPattern}(?:[xX\\u00D7*]\\s*\\d{1,5}|\\d{1,5}\\s*(?:\\u8FDE\\u51FB|\\u9023\\u64CA|\\u4E2A|\\u500B|\\u4EFD|\\u5F20))\\s*$`, 'u').test(normalizedText);
                const likelyMergedText = countMatches(normalizedText, /[:\uFF1A]/gu) > 3 || countMatches(normalizedText, /(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9|\u6253\u8D4F|\u6295\u5582|\u9001\s+)/gu) > 1;
                const structuredUserName = reactData.userName || describeGift.userName || structuredGift.userName;
                let giftName = reactData.giftName || describeGift.giftName || structuredGift.giftName;
                let giftCount = reactData.giftCount || describeGift.giftCount || structuredGift.giftCount || parseGiftCountEnhanced(describeText || normalizedText);
                let bestScore = isGiftNameCandidateEnhanced(giftName) ? scoreGiftCandidateEnhanced(giftName, normalizedText, structuredUserName) : -1;
                for (const candidate of candidates) {
                    if (!candidate || candidate.length > 120) {
                        continue;
                    }
                    const cleaned = cleanupGiftNameEnhanced(candidate);
                    if (!isGiftNameCandidateEnhanced(cleaned)) {
                        continue;
                    }
                    if (!overallLooksLikeGift &&
                        !containsGiftSignal(candidate) &&
                        !/(\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968)/u.test(candidate)) {
                        continue;
                    }
                    if ((actionOnlyText || likelyMergedText) &&
                        !trustedCandidateSet.has(candidate) &&
                        !actualGiftKeywords.some((keyword) => cleaned.includes(keyword))) {
                        continue;
                    }
                    const score = scoreGiftCandidateEnhanced(cleaned, normalizedText, structuredUserName);
                    if (score > bestScore) {
                        giftName = cleaned;
                        giftCount = Math.max(giftCount, parseGiftCountEnhanced(candidate));
                        bestScore = score;
                    }
                }
                if (structuredUserName && giftName) {
                    const normalizedUserName = normalizeUserName(structuredUserName);
                    const normalizedGiftName = normalizeUserName(giftName);
                    if (normalizedGiftName &&
                        normalizedUserName &&
                        (normalizedGiftName === normalizedUserName ||
                            normalizedGiftName.includes(normalizedUserName) ||
                            normalizedUserName.includes(normalizedGiftName))) {
                        giftName = undefined;
                    }
                }
                return {
                    userName: structuredUserName || undefined,
                    giftName: isGiftNameCandidateEnhanced(giftName) ? giftName : undefined,
                    giftCount,
                };
            };const collectUserCandidates = (element) => {
                const candidates = [];
                const nodes = [];
                const primaryAnchor = element.querySelector('a[href*="/user/"],a[href*="sec_uid="],a[href*="/follow/"],a[href*="modal_id="]');
                if (primaryAnchor) {
                    nodes.push(primaryAnchor);
                }
                nodes.push(...Array.from(element.querySelectorAll('[data-e2e*="user"],[class*="nick"],[class*="name"],strong,b,span[title],span[aria-label],[title],[aria-label],img[alt]')).slice(0, 20));
                for (const node of nodes) {
                    let value = '';
                    if (node instanceof HTMLImageElement) {
                        value = node.alt;
                    }
                    else if (node instanceof HTMLElement) {
                        value = node.getAttribute('title') || node.getAttribute('aria-label') || node.textContent || '';
                    }
                    const normalizedValue = normalize(value);
                    if (!normalizedValue || normalizedValue.length > 32) {
                        continue;
                    }
                    if (/^https?:\/\//u.test(normalizedValue) || /^[0-9]+$/u.test(normalizedValue)) {
                        continue;
                    }
                    if (genericPatterns.some((pattern) => pattern.test(normalizedValue))) {
                        continue;
                    }
                    if (genericFragments.some((fragment) => normalizedValue.includes(fragment))) {
                        continue;
                    }
                    if (actionWords.some((keyword) => normalizedValue.includes(keyword))) {
                        continue;
                    }
                    if (/^(?:\u8BC4\u8BBA|\u8FDB\u573A|\u4E92\u52A8|\u9001\u793C|\u793C\u7269|\u76F4\u64AD\u95F4|\u7C89\u4E1D\u56E2|\u66F4\u591A)$/u.test(normalizedValue)) {
                        continue;
                    }
                    if (!candidates.includes(normalizedValue)) {
                        candidates.push(normalizedValue);
                    }
                }
                return candidates;
            };
                        const chooseCandidate = (text, category, candidates) => {
                if (!candidates.length) {
                    return '';
                }
                if (category === 'comment') {
                    const explicit = candidates.find((candidate) => text.startsWith(`${candidate}:`) || text.startsWith(`${candidate}\uFF1A`));
                    if (explicit) {
                        return explicit;
                    }
                }
                const prefixMatched = candidates.find((candidate) => text.startsWith(candidate));
                return prefixMatched || candidates[0];
            };const collectUserCandidatesEnhanced = (element) => collectUserCandidates(element)
                .map((candidate) => normalizeUserName(candidate))
                .filter((candidate) => candidate && !/^(?:combo animation|\u9001)$/iu.test(candidate));
                        const chooseCandidateEnhanced = (text, category, candidates) => {
                const availableCandidates = category === 'comment'
                    ? candidates.filter((candidate) => isPlausibleCommentUserName(candidate))
                    : candidates;
                if (!availableCandidates.length) {
                    return '';
                }
                if (category === 'comment') {
                    const explicit = availableCandidates.find((candidate) => text.startsWith(`${candidate}:`) || text.startsWith(`${candidate}\uFF1A`));
                    if (explicit) {
                        return explicit;
                    }
                }
                const prefixMatched = availableCandidates.find((candidate) => text.startsWith(candidate));
                return normalizeUserName(prefixMatched || availableCandidates[0]);
            };
            const chooseBetterGiftName = (current, candidate, fullText, userName = '') => {
                const cleanedCurrent = cleanupGiftNameEnhanced(current || '');
                const cleanedCandidate = cleanupGiftNameEnhanced(candidate || '');
                const currentUsable = isGiftNameCandidateEnhanced(cleanedCurrent);
                const candidateUsable = isGiftNameCandidateEnhanced(cleanedCandidate);
                if (!currentUsable) {
                    return candidateUsable ? cleanedCandidate : undefined;
                }
                if (!candidateUsable) {
                    return cleanedCurrent;
                }
                const currentScore = scoreGiftCandidateEnhanced(cleanedCurrent, fullText, userName);
                const candidateScore = scoreGiftCandidateEnhanced(cleanedCandidate, fullText, userName);
                if (candidateScore > currentScore) {
                    return cleanedCandidate;
                }
                if (candidateScore === currentScore && cleanedCandidate.length > cleanedCurrent.length) {
                    return cleanedCandidate;
                }
                return cleanedCurrent;
            };
            const isCommentSideNoise = (value) => {
                const normalizedValue = normalize(value);
                if (!normalizedValue) {
                    return true;
                }
                return /^(?:\d{1,3}[\u3002.]?|\d{1,3}\s*(?:\u7EA7|\u7B49\u7EA7|\u7B49\u7D1A|\u94BB|\u5206)|(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\(?\s*\d{1,4}\s*(?:s|S|\u79D2|\u79D2\u949F)\s*\)?)$/u.test(normalizedValue);
            };
            const collapseLeadingRichCommentOverlap = (value) => {
                const normalizedValue = normalize(value);
                const compactMatched = normalizedValue.match(/^(@\S{1,32})\s+\1(?=\s|$)(.*)$/u) ||
                    normalizedValue.match(/^((?:[\[\u3010][^\]\u3011]{1,24}[\]\u3011])\S{0,24})\s+\1(?=\s|$)(.*)$/u);
                if (compactMatched) {
                    return normalize(`${compactMatched[1]} ${compactMatched[2] || ''}`);
                }
                const parts = normalizedValue.split(/\s+/u).filter(Boolean);
                const maxPrefixParts = Math.min(4, Math.floor(parts.length / 2));
                for (let size = 1; size <= maxPrefixParts; size += 1) {
                    const first = parts.slice(0, size).join(' ');
                    const second = parts.slice(size, size * 2).join(' ');
                    if (first &&
                        first === second &&
                        /@|[\[\u3010][^\]\u3011]{1,24}[\]\u3011]/u.test(first)) {
                        return normalize(parts.slice(size).join(' '));
                    }
                }
                return normalizedValue;
            };
            const cleanupCommentBodyCandidate = (value, userName = '') => {
                const normalizedValue = normalize(value);
                if (!normalizedValue) {
                    return '';
                }
                const withoutLeadingSideNoise = normalize(normalizedValue.replace(/^(?:\d{1,3}(?:[\u3002.]|\s*(?:\u7EA7|\u7B49\u7EA7|\u7B49\u7D1A|\u94BB|\u5206))?|(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\(?\s*\d{1,4}\s*(?:s|S|\u79D2|\u79D2\u949F)\s*\)?)\s+(?=\S)/u, ''));
                const withoutNoise = withoutLeadingSideNoise || normalizedValue;
                const normalizedUserName = normalizeUserName(userName);
                const withoutUserPrefix = normalizedUserName
                    ? normalize(withoutNoise.replace(new RegExp(`^${escapeRegex(normalizedUserName)}\\s*[:\\uFF1A]?\\s*`, 'u'), ''))
                    : withoutNoise;
                return collapseLeadingRichCommentOverlap(withoutUserPrefix || withoutNoise);
            };
            const isPlausibleCommentBodyCandidate = (value, userName, fullText) => {
                const normalizedValue = normalize(value);
                const normalizedUserName = normalizeUserName(userName);
                const normalizedFullText = normalize(fullText);
                const looksLikeRichUserComment =
                    /@|[\u3002\uFF0C\uFF01\uFF1F,!?]/u.test(normalizedValue) &&
                    !/^(?:\u8FDB\u5165\u76F4\u64AD\u95F4|\u9000\u51FA\u76F4\u64AD\u95F4|\u66F4\u591A\u76F4\u64AD|\u76F4\u64AD\u6570\u636E)$/u.test(normalizedValue);
                if (!normalizedValue || normalizedValue.length > 160) {
                    return false;
                }
                if (normalizedValue === normalizedFullText || normalizedValue === normalizedUserName || normalizeUserName(normalizedValue) === normalizedUserName) {
                    return false;
                }
                if (/^https?:\/\//iu.test(normalizedValue) || isDirectProfileId(normalizedValue)) {
                    return false;
                }
                if (isCommentSideNoise(normalizedValue)) {
                    return false;
                }
                if (!looksLikeRichUserComment && genericPatterns.some((pattern) => pattern.test(normalizedValue))) {
                    return false;
                }
                if (!looksLikeRichUserComment && genericFragments.some((fragment) => normalizedValue.includes(fragment))) {
                    return false;
                }
                return true;
            };
            const shouldPreferCommentBodyCandidate = (candidate, current) => {
                const normalizedCandidate = normalize(candidate);
                const normalizedCurrent = normalize(current);
                if (!normalizedCandidate) {
                    return false;
                }
                if (!normalizedCurrent || normalizedCandidate === normalizedCurrent) {
                    return true;
                }
                const currentHasRichBody = /@|[\[\u3010][^\]\u3011]{1,24}[\]\u3011]/u.test(normalizedCurrent);
                if (currentHasRichBody &&
                    normalizedCurrent.endsWith(normalizedCandidate) &&
                    normalizedCurrent.length > normalizedCandidate.length + 2) {
                    return false;
                }
                if (normalizedCurrent.includes(normalizedCandidate) &&
                    normalizedCurrent.length > normalizedCandidate.length * 2 &&
                    normalizedCandidate.length <= 8) {
                    return false;
                }
                return true;
            };
            const scoreCommentBodyNode = (node, value, fullText, userName) => {
                const normalizedValue = normalize(value);
                const normalizedVisibleBody = cleanupCommentBodyCandidate(fullText, userName);
                const marker = normalize([
                    node.className,
                    node.getAttribute('data-e2e'),
                    node.getAttribute('aria-label'),
                    node.getAttribute('title'),
                ].join(' '));
                let score = 0;
                if (/(?:chatroom___content|content|comment|message|msg|text)/iu.test(marker)) {
                    score += 4;
                }
                if (/(?:nick|name|user|avatar|level|badge|rank|time|fans|medal|follow|author)/iu.test(marker)) {
                    score -= 5;
                }
                if (node instanceof HTMLAnchorElement) {
                    score -= 4;
                }
                if (isCommentSideNoise(value)) {
                    score -= 8;
                }
                if (normalizeUserName(value) === normalizeUserName(userName)) {
                    score -= 8;
                }
                if (normalize(fullText).endsWith(value)) {
                    score += 2;
                }
                if (
                    normalizedVisibleBody &&
                    normalizedValue.startsWith(normalizedVisibleBody) &&
                    normalizedValue.length > normalizedVisibleBody.length + 2
                ) {
                    score += 8;
                }
                if (/[\u3002\uFF01\uFF1F!?]/u.test(value)) {
                    score += 1;
                }
                if (value.length > 1) {
                    score += 1;
                }
                return score;
            };
            const chooseCommentBodyCandidate = (element, fullText, userName) => {
                if (!(element instanceof HTMLElement)) {
                    return '';
                }
                const selector = [
                    '[class*="chatroom___content"]',
                    '[class*="content"]',
                    '[class*="Content"]',
                    '[class*="comment"]',
                    '[class*="Comment"]',
                    '[class*="message"]',
                    '[class*="Message"]',
                    '[class*="text"]',
                    '[class*="Text"]',
                    '[data-e2e*="comment"]',
                    '[data-e2e*="message"]',
                    '[data-e2e*="content"]',
                    'span',
                    'div',
                ].join(',');
                const scored = [];
                const seenCandidates = new Set();
                for (const node of [element, ...Array.from(element.querySelectorAll(selector)).slice(0, 80)]) {
                    if (!(node instanceof HTMLElement)) {
                        continue;
                    }
                    const rawValue = node.getAttribute('title') || node.getAttribute('aria-label') || node.innerText || node.textContent || '';
                    const value = cleanupCommentBodyCandidate(rawValue, userName);
                    if (!isPlausibleCommentBodyCandidate(value, userName, fullText) || seenCandidates.has(value)) {
                        continue;
                    }
                    seenCandidates.add(value);
                    scored.push({
                        value,
                        score: scoreCommentBodyNode(node, value, fullText, userName),
                    });
                }
                scored.sort((left, right) => right.score - left.score || left.value.length - right.value.length);
                return scored[0]?.score > 0 ? scored[0].value : '';
            };
            const parseUser = (element, text, category) => {
                const reactData = collectReactMessageData(element);
                const userMeta = collectUserMeta(element);
                const candidates = collectUserCandidatesEnhanced(element);
                let userName = reactData.userName || '';
                let displayText = text;
                let giftName = reactData.giftName || undefined;
                let giftCount = reactData.giftCount || undefined;
                if (category === 'comment') {
                    const commentMatch = text.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*(.+)$/u);
                    const matchedUserName = normalizeUserName(commentMatch?.[1]);
                    if (commentMatch && isPlausibleCommentUserName(matchedUserName)) {
                        userName = userName || matchedUserName;
                        displayText = normalize(commentMatch[2]);
                    }
                    else if (commentMatch) {
                        displayText = normalize(commentMatch[2]);
                    }
                }
                if (category === 'entry' || category === 'interaction') {
                    const actionMatch = text.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*(\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD|\u70B9\u8D5E|\u5173\u6CE8|\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u63A8\u8350\u4E86\u76F4\u64AD|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206)$/u) ||
                        text.match(/^(.{1,24}?)(\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD|\u70B9\u8D5E|\u5173\u6CE8|\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u63A8\u8350\u4E86\u76F4\u64AD|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206)$/u);
                    if (actionMatch) {
                        const actionUserName = normalizeUserName(actionMatch[1]);
                        userName = actionUserName.includes('\u795E\u79D8\u4EBA') ? actionUserName : userName || actionUserName;
                        displayText = normalize(actionMatch[2]);
                    }
                }
                if (category === 'gift') {
                    const parsedGiftText = extractGiftPayloadFromText(text);
                    const parsedGift = parseGiftEnhanced(text, element);
                    const preferredGiftUserName = userName || parsedGift.userName || parsedGiftText.userName || '';
                    giftName = chooseBetterGiftName(giftName, parsedGift.giftName, text, preferredGiftUserName);
                    giftName = chooseBetterGiftName(giftName, parsedGiftText.giftName, text, preferredGiftUserName);
                    const candidateGiftCount = Math.max(giftCount || 0, parsedGift.giftCount || 0, parsedGiftText.giftCount || 0);
                    giftCount = candidateGiftCount > 0 ? candidateGiftCount : undefined;
                    if (parsedGift.userName || parsedGiftText.userName) {
                        userName = userName || parsedGift.userName || parsedGiftText.userName;
                    }
                }
                if (!userName) {
                    userName = chooseCandidateEnhanced(text, category, candidates);
                }
                userName = category === 'gift' ? normalizeGiftUserName(userName, giftName || '') : normalizeUserName(userName);
                if (category === 'comment' && userName && !userMeta.userLink && !userMeta.userId && !isPlausibleCommentUserName(userName)) {
                    userName = '';
                }
                if (category === 'comment' && userName && displayText === text) {
                    const stripped = normalize(text.replace(new RegExp(`^${escapeRegex(userName)}\\s*[:\\uFF1A]?\\s*`, 'u'), ''));
                    if (stripped && stripped !== text) {
                        displayText = stripped;
                    }
                }
                if (category === 'comment') {
                    const commentBodyCandidate = chooseCommentBodyCandidate(element, text, userName);
                    if (shouldPreferCommentBodyCandidate(commentBodyCandidate, displayText)) {
                        displayText = commentBodyCandidate;
                    }
                    displayText = collapseLeadingRichCommentOverlap(displayText);
                }
                return {
                    userName: userName || undefined,
                    userLink: userMeta.userLink || undefined,
                    userId: userMeta.userId || undefined,
                    displayText,
                    giftName: isGiftNameCandidateEnhanced(giftName) ? giftName : undefined,
                    giftCount,
                };
            };const makeSignature = (payload) => [
                payload.category,
                payload.sourceId,
                payload.userName,
                payload.userId,
                payload.userLink,
                payload.text,
                payload.giftName,
                payload.giftCount,
            ].join('|');
            const extractUserNameFromRawText = (payload) => {
                const normalizedText = normalize(payload.rawText || payload.text || '');
                if (!normalizedText) {
                    return '';
                }
                const actionMatched = normalizedText.match(/^(.{1,24}?)(?:\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD|\u70B9\u8D5E|\u5173\u6CE8|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001)/u);
                if (actionMatched) {
                    return normalizeUserName(actionMatched[1]);
                }
                const colonMatched = normalizedText.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*(.+)$/u);
                return colonMatched && isPlausibleCommentUserName(colonMatched[1]) ? normalizeUserName(colonMatched[1]) : '';
            };
            const makeElementFingerprint = (payload) => [
                payload.category,
                payload.sourceId,
                payload.rawText,
                payload.text,
                payload.userName,
                payload.userId,
                payload.userLink,
                payload.giftName,
                payload.giftCount,
            ].join('|');
            const makeCoarseSignature = (payload) => {
                const coarseUserName = payload.userName || extractUserNameFromRawText(payload);
                const coarseUserKey = coarseUserName || payload.userId || payload.userLink;
                if (payload.category === 'gift') {
                    return [
                        payload.category,
                        payload.sourceId,
                        coarseUserKey,
                        payload.giftName,
                        payload.giftCount || 1,
                    ].join('|');
                }
                if (payload.category === 'comment') {
                    return [
                        payload.category,
                        payload.sourceId,
                        coarseUserKey,
                        payload.text,
                    ].join('|');
                }
                return [
                    payload.category,
                    coarseUserKey,
                    payload.text,
                ].join('|');
            };
            const payloadHasExplicitGiftCount = (payload) => payload.category === 'gift' && (hasExplicitGiftCount(payload.rawText || payload.text || '') || Number(payload.giftCount) > 1);
            const getPayloadQuality = (payload) => {
                let score = 0;
                if (payload.userName) {
                    score += 2;
                }
                if (payload.userId) {
                    score += 4;
                }
                if (payload.userLink) {
                    score += 4;
                }
                if (payload.giftName) {
                    score += 3;
                }
                if (payload.category === 'gift' && payloadHasExplicitGiftCount(payload)) {
                    score += 5;
                }
                if (payload.text && payload.rawText && payload.text !== payload.rawText) {
                    score += 1;
                }
                if (payload.category === 'gift' && /^\S.+\s+->\s+.+\sx\d+$/u.test(String(payload.text ?? ''))) {
                    score += 2;
                }
                return score;
            };
            const isGiftPayloadReady = (payload) => payload?.category === 'gift' &&
                Boolean(payload.giftName) &&
                Boolean(payload.userName || payload.userId || payload.userLink);
            const normalizeGiftPayloadForEmit = (payload) => {
                if (payload?.category !== 'gift') {
                    return payload;
                }
                const normalizedCount = Number(payload.giftCount) > 0 ? Number(payload.giftCount) : 1;
                const normalizedPayload = {
                    ...payload,
                    giftCount: normalizedCount,
                };
                if (normalizedPayload.userName && normalizedPayload.giftName) {
                    normalizedPayload.text = `${normalizedPayload.userName} -> ${normalizedPayload.giftName} x${normalizedCount}`;
                }
                return normalizedPayload;
            };
            const selectPreferredGiftPayload = (current, candidate) => {
                if (!current) {
                    return normalizeGiftPayloadForEmit(candidate);
                }
                const normalizedCurrent = normalizeGiftPayloadForEmit(current);
                const normalizedCandidate = normalizeGiftPayloadForEmit(candidate);
                const currentQuality = getPayloadQuality(normalizedCurrent);
                const candidateQuality = getPayloadQuality(normalizedCandidate);
                if (candidateQuality > currentQuality) {
                    return normalizedCandidate;
                }
                if (candidateQuality < currentQuality) {
                    return normalizedCurrent;
                }
                if ((normalizedCandidate.giftCount || 0) > (normalizedCurrent.giftCount || 0)) {
                    return normalizedCandidate;
                }
                if (String(normalizedCandidate.giftName || '').length > String(normalizedCurrent.giftName || '').length) {
                    return normalizedCandidate;
                }
                if (String(normalizedCandidate.rawText || '').length > String(normalizedCurrent.rawText || '').length) {
                    return normalizedCandidate;
                }
                return normalizedCurrent;
            };
            const flushGiftPayload = (element) => {
                const state = giftElementStates.get(element);
                if (!state?.payload) {
                    return;
                }
                if (state.timer) {
                    window.clearTimeout(state.timer);
                    state.timer = 0;
                }
                const payload = normalizeGiftPayloadForEmit(state.payload);
                if (!isGiftPayloadReady(payload)) {
                    giftElementStates.delete(element);
                    return;
                }
                const fingerprint = makeElementFingerprint(payload);
                if (state.lastFlushedFingerprint === fingerprint) {
                    return;
                }
                state.lastFlushedFingerprint = fingerprint;
                state.payload = payload;
                giftElementStates.set(element, state);
                push(payload);
            };
            const stageGiftPayload = (element, payload) => {
                if (!(element instanceof HTMLElement)) {
                    if (isGiftPayloadReady(payload)) {
                        push(normalizeGiftPayloadForEmit(payload));
                    }
                    return;
                }
                const scopedElement = findChatItemRoot(element);
                if (!(scopedElement instanceof HTMLElement)) {
                    return;
                }
                const previousState = giftElementStates.get(scopedElement) || {};
                const bestPayload = selectPreferredGiftPayload(previousState.payload, payload);
                const nextState = {
                    ...previousState,
                    payload: bestPayload,
                    updatedAt: Date.now(),
                };
                if (previousState.timer) {
                    window.clearTimeout(previousState.timer);
                    nextState.timer = 0;
                }
                const delayMs = payloadHasExplicitGiftCount(bestPayload) ? 50 : isGiftPayloadReady(bestPayload) ? 160 : GIFT_PENDING_FLUSH_DELAY_MS;
                nextState.timer = window.setTimeout(() => {
                    const latestState = giftElementStates.get(scopedElement);
                    if (!latestState) {
                        return;
                    }
                    latestState.timer = 0;
                    giftElementStates.set(scopedElement, latestState);
                    flushGiftPayload(scopedElement);
                }, delayMs);
                giftElementStates.set(scopedElement, nextState);
                cleanupHandles.push(nextState.timer);
            };
            const extractGiftMessagePayload = (message) => {
                if (!message || typeof message !== 'object') {
                    return null;
                }
                const directPayload = message.payload && typeof message.payload === 'object' ? message.payload : null;
                if (!directPayload) {
                    return null;
                }
                if (directPayload.msg && typeof directPayload.msg === 'object') {
                    return directPayload.msg;
                }
                return directPayload;
            };
            const buildGiftPayloadFromMessage = (message) => {
                const payload = extractGiftMessagePayload(message);
                if (!payload || payload.repeat_end) {
                    return null;
                }
                const user = payload.user && typeof payload.user === 'object'
                    ? payload.user
                    : payload.from_user && typeof payload.from_user === 'object'
                        ? payload.from_user
                        : payload.fromUser && typeof payload.fromUser === 'object'
                            ? payload.fromUser
                            : payload.sender && typeof payload.sender === 'object'
                                ? payload.sender
                                : {};
                const gift = payload.gift && typeof payload.gift === 'object' ? payload.gift : {};
                const descriptionCandidates = [
                    payload.describe,
                    payload.display_text,
                    payload.displayText,
                    payload.display_content,
                    payload.displayContent,
                    payload.toast,
                    payload.content,
                    payload.common?.describe,
                    payload.common?.display_text,
                    payload.common?.displayText,
                    payload.common?.display_content,
                    payload.common?.displayContent,
                    payload.public_area_common?.describe,
                    payload.public_area_common?.display_text,
                    payload.public_area_common?.display_content,
                    payload.publicAreaCommon?.describe,
                    payload.publicAreaCommon?.display_text,
                    payload.publicAreaCommon?.displayText,
                    payload.publicAreaCommon?.display_content,
                    payload.publicAreaCommon?.displayContent,
                    gift.describe,
                ]
                    .map((item) => normalize(String(item ?? '')))
                    .filter(Boolean);
                const parsedDescriptions = descriptionCandidates
                    .map((item) => extractGiftPayloadFromText(item))
                    .filter((item) => item && (item.userName || item.giftName));
                const directUserName = normalizeUserName(user.nickname || user.desensitized_nickname || user.display_id || user.remark_name || payload.user_name || payload.userName || '');
                const parsedUserName = parsedDescriptions.find((item) => item.userName)?.userName || '';
                const profileUserId = normalize(extractUserIdFromValue(user.sec_uid || user.secUid || user.webcast_uid || user.webcastUid || user.open_id || user.openId || user.profile_schema || user.profileSchema || user.schema_url || user.schemaUrl || payload.sec_user_id || payload.secUserId || payload.sec_uid || payload.secUid || payload.open_id || payload.openId || payload.from_user_id || payload.fromUserId || payload.common?.sec_user_id || payload.common?.secUserId || payload.common?.sec_uid || payload.common?.secUid || payload.common?.user_id || payload.public_area_common?.default_click_schema_url || payload.publicAreaCommon?.default_click_schema_url || payload.publicAreaCommon?.schema_url || payload.publicAreaCommon?.schemaUrl || '')) || undefined;
                const displayUserId = normalize(user.display_id || user.displayId || user.unique_id || user.uniqueId || user.user_unique_id || user.userUniqueId || user.id_str || user.id || user.uid || user.user_id || user.userId || user.open_id || user.openId || payload.user_id || payload.userId || payload.from_user_id || payload.fromUserId || payload.open_id || payload.openId || payload.common?.user_id || '');
                const userId = normalize(extractUserIdFromValue(displayUserId || profileUserId || '')) || undefined;
                const userLink = profileUserId && isDirectProfileId(profileUserId) ? `https://www.douyin.com/user/${encodeURIComponent(profileUserId)}` : undefined;
                const giftNameCandidates = [
                    gift.name,
                    gift.describe,
                    gift.gift_name,
                    gift.giftName,
                    gift.display_name,
                    gift.displayName,
                    payload.gift_name,
                    payload.giftName,
                    ...descriptionCandidates,
                    ...parsedDescriptions.map((item) => item.giftName),
                ]
                    .map((item) => cleanupGiftNameEnhanced(String(item ?? '')))
                    .filter(Boolean);
                const giftName = giftNameCandidates.find((item) => isGiftNameCandidateEnhanced(item)) || giftNameCandidates[0] || '';
                const userName = normalizeGiftUserName(directUserName || parsedUserName || '', giftName);
                const giftCount = Math.max(toPositiveInt(payload.repeat_count), toPositiveInt(payload.repeatCount), toPositiveInt(payload.combo_count), toPositiveInt(payload.comboCount), toPositiveInt(payload.group_count), toPositiveInt(payload.groupCount), toPositiveInt(payload.total_count), toPositiveInt(payload.totalCount), toPositiveInt(payload.count), toPositiveInt(gift.combo_count), toPositiveInt(gift.comboCount), toPositiveInt(gift.count), ...parsedDescriptions.map((item) => toPositiveInt(item.giftCount)), 1);
                if (!userName || !isGiftNameCandidateEnhanced(giftName)) {
                    return null;
                }
                return normalizeGiftPayloadForEmit({
                    category: 'gift',
                    sourceId: normalize(payload.msg_id || payload.msgId || payload.message_id || payload.messageId || payload.id || payload.id_str || payload.idStr || payload.common?.msg_id || payload.common?.msgId || payload.common?.message_id || payload.common?.messageId || ''),
                    rawText: `${userName} 送礼 ${giftName} x${giftCount}`,
                    text: `${userName} -> ${giftName} x${giftCount}`,
                    userName,
                    userId,
                    userLink,
                    giftName,
                    giftCount,
                });
            };
            const attachGiftMessageBridge = () => {
                if (windowAny.__douyinCollectorGiftBridgeInstalled) {
                    return true;
                }
                const messageInstance = windowAny.__MESSAGE_INSTANCE__ || windowAny.__STORE__?.singletonStore?.message;
                if (!messageInstance || typeof messageInstance.on !== 'function') {
                    return false;
                }
                const bindEvent = (eventName) => {
                    const handler = (messages) => {
                        if (!Array.isArray(messages)) {
                            return;
                        }
                        for (const message of messages) {
                            const payload = buildGiftPayloadFromMessage(message);
                            if (payload) {
                                push(payload);
                            }
                        }
                    };
                    messageInstance.on(eventName, handler);
                    if (typeof messageInstance.off === 'function') {
                        messageCleanupHandles.push(() => {
                            try {
                                messageInstance.off(eventName, handler);
                            }
                            catch {
                                // Ignore teardown failures on unstable pages.
                            }
                        });
                    }
                };
                bindEvent('GiftMessage');
                bindEvent('BindingGiftMessage');
                bindEvent('AssetEffectUtilMessage');
                windowAny.__douyinCollectorGiftBridgeInstalled = true;
                return true;
            };
            const shouldDigestElement = (element, fingerprint) => {
                if (!(element instanceof HTMLElement) || !fingerprint) {
                    return true;
                }
                const now = Date.now();
                const previous = digestedElements.get(element);
                if (previous && previous.fingerprint === fingerprint && now - previous.at < 180000) {
                    return false;
                }
                digestedElements.set(element, { fingerprint, at: now });
                return true;
            };
            const cleanupSeen = () => {
                const now = Date.now();
                for (const [key, ts] of seen.entries()) {
                    if (now - ts > 20000) {
                        seen.delete(key);
                    }
                }
                for (const [key, meta] of coarseSeen.entries()) {
                    if (!meta || now - meta.at > 5000) {
                        coarseSeen.delete(key);
                    }
                }
                while (seen.size > 1200) {
                    const oldestKey = seen.keys().next().value;
                    if (!oldestKey) {
                        break;
                    }
                    seen.delete(oldestKey);
                }
                while (coarseSeen.size > 800) {
                    const oldestKey = coarseSeen.keys().next().value;
                    if (!oldestKey) {
                        break;
                    }
                    coarseSeen.delete(oldestKey);
                }
            };
            const flush = async () => {
                if (flushing) {
                    flushAgain = true;
                    return;
                }
                if (flushTimer) {
                    window.clearTimeout(flushTimer);
                    flushTimer = 0;
                }
                if (!pending.length || typeof windowAny.__douyinCollectorBatch !== 'function') {
                    return;
                }
                flushing = true;
                const batch = pending.splice(0, pending.length);
                pendingCoarseKeys.clear();
                try {
                    await windowAny.__douyinCollectorBatch(batch);
                    diag('collector.flush', 'flush.batch_sent', {
                        category: 'comment',
                        pendingLength: batch.length,
                        commentCount: batch.filter((item) => item?.category === 'comment').length,
                    });
                }
                catch {
                    diag('collector.flush', 'flush.batch_failed', {
                        category: 'comment',
                        pendingLength: batch.length,
                        commentCount: batch.filter((item) => item?.category === 'comment').length,
                    });
                    pending.unshift(...batch);
                    if (pending.length > maxPendingCount) {
                        const removed = pending.splice(0, pending.length - maxPendingCount);
                        diag('collector.flush', 'flush.pending_trimmed_after_retry', {
                            category: 'comment',
                            pendingLength: pending.length,
                            trimmedLength: removed.length,
                            commentCount: removed.filter((item) => item?.category === 'comment').length,
                        });
                    }
                }
                finally {
                    flushing = false;
                    if (flushAgain || pending.length) {
                        flushAgain = false;
                        scheduleFlush(0);
                    }
                }
            };
            const scheduleFlush = (delayOverride) => {
                if (flushTimer) {
                    return;
                }
                    flushTimer = window.setTimeout(() => {
                        flushTimer = 0;
                        void flush();
                }, typeof delayOverride === 'number' ? delayOverride : flushDelayMs);
            };
            const push = (payload) => {
                if (!payload.collectorClientId) {
                    collectorClientSequence += 1;
                    payload.collectorClientId = `${Date.now()}-${collectorClientSequence}`;
                }
                const signature = makeSignature(payload);
                const coarseSignature = makeCoarseSignature(payload);
                const now = Date.now();
                const exactDedupeWindow = payload.category === 'gift' ? 45 : 320;
                const coarseDedupeWindow = payload.category === 'gift' ? 120 : 900;
                if (payload.category === 'comment') {
                    seen.set(signature, now);
                    pending.push(payload);
                    diag('collector.push', 'push.queued', diagPayload(payload, {
                        signature,
                        coarseSignature,
                        quality: getPayloadQuality(payload),
                        pendingLength: pending.length,
                        reasonDetail: 'comment_no_body_dedupe',
                    }));
                    if (pending.length >= flushImmediateThreshold) {
                        void flush();
                        return;
                    }
                    scheduleFlush();
                    return;
                }
                const lastAt = seen.get(signature) ?? 0;
                if (now - lastAt < exactDedupeWindow) {
                    if (payload.category === 'comment') {
                        diag('collector.push', 'push.exact_dedupe', diagPayload(payload, {
                            signature,
                            coarseSignature,
                            ageMs: now - lastAt,
                            pendingLength: pending.length,
                        }));
                    }
                    return;
                }
                const quality = getPayloadQuality(payload);
                const hasExplicitCount = payloadHasExplicitGiftCount(payload);
                const pendingIndex = pendingCoarseKeys.get(coarseSignature);
                if (typeof pendingIndex === 'number' && pendingIndex >= 0 && pendingIndex < pending.length) {
                    const existingPayload = pending[pendingIndex];
                    if (existingPayload) {
                        const existingQuality = getPayloadQuality(existingPayload);
                        const existingHasExplicitCount = payloadHasExplicitGiftCount(existingPayload);
                        if (existingHasExplicitCount && !hasExplicitCount) {
                            if (payload.category === 'comment') {
                                diag('collector.push', 'push.pending_coarse_dropped', diagPayload(payload, {
                                    signature,
                                    coarseSignature,
                                    quality,
                                    existingQuality,
                                    pendingLength: pending.length,
                                    reasonDetail: 'existing_explicit_count',
                                }));
                            }
                            return;
                        }
                        if (!existingHasExplicitCount && hasExplicitCount) {
                            pending[pendingIndex] = payload;
                            seen.set(signature, now);
                            coarseSeen.set(coarseSignature, { at: now, score: quality, signature, explicitCount: hasExplicitCount });
                            if (payload.category === 'comment') {
                                diag('collector.push', 'push.pending_coarse_replaced', diagPayload(payload, {
                                    signature,
                                    coarseSignature,
                                    quality,
                                    existingQuality,
                                    pendingLength: pending.length,
                                    reasonDetail: 'new_explicit_count',
                                }));
                            }
                            return;
                        }
                        if (existingQuality > quality) {
                            if (payload.category === 'comment') {
                                diag('collector.push', 'push.pending_coarse_dropped', diagPayload(payload, {
                                    signature,
                                    coarseSignature,
                                    quality,
                                    existingQuality,
                                    pendingLength: pending.length,
                                    reasonDetail: 'lower_quality',
                                }));
                            }
                            return;
                        }
                        if (existingQuality === quality && makeSignature(existingPayload) !== signature) {
                            if (payload.category === 'comment') {
                                diag('collector.push', 'push.pending_coarse_dropped', diagPayload(payload, {
                                    signature,
                                    coarseSignature,
                                    quality,
                                    existingQuality,
                                    pendingLength: pending.length,
                                    reasonDetail: 'equal_quality_distinct_signature',
                                }));
                            }
                            return;
                        }
                        pending[pendingIndex] = payload;
                        seen.set(signature, now);
                        coarseSeen.set(coarseSignature, { at: now, score: quality, signature, explicitCount: hasExplicitCount });
                        if (payload.category === 'comment') {
                            diag('collector.push', 'push.pending_coarse_replaced', diagPayload(payload, {
                                signature,
                                coarseSignature,
                                quality,
                                existingQuality,
                                pendingLength: pending.length,
                                reasonDetail: 'higher_or_equal_quality',
                            }));
                        }
                        return;
                    }
                }
                const previousCoarse = coarseSeen.get(coarseSignature);
                if (previousCoarse && now - previousCoarse.at < coarseDedupeWindow) {
                    if (previousCoarse.explicitCount && !hasExplicitCount) {
                        if (payload.category === 'comment') {
                            diag('collector.push', 'push.previous_coarse_dropped', diagPayload(payload, {
                                signature,
                                coarseSignature,
                                quality,
                                previousScore: previousCoarse.score,
                                pendingLength: pending.length,
                                reasonDetail: 'previous_explicit_count',
                            }));
                        }
                        return;
                    }
                    if (previousCoarse.score > quality) {
                        if (payload.category === 'comment') {
                            diag('collector.push', 'push.previous_coarse_dropped', diagPayload(payload, {
                                signature,
                                coarseSignature,
                                quality,
                                previousScore: previousCoarse.score,
                                pendingLength: pending.length,
                                reasonDetail: 'previous_higher_quality',
                            }));
                        }
                        return;
                    }
                    if (previousCoarse.score === quality && previousCoarse.signature !== signature) {
                        if (payload.category === 'comment') {
                            diag('collector.push', 'push.previous_coarse_dropped', diagPayload(payload, {
                                signature,
                                coarseSignature,
                                quality,
                                previousScore: previousCoarse.score,
                                pendingLength: pending.length,
                                reasonDetail: 'previous_equal_quality_distinct_signature',
                            }));
                        }
                        return;
                    }
                }
                seen.set(signature, now);
                pendingCoarseKeys.set(coarseSignature, pending.length);
                coarseSeen.set(coarseSignature, { at: now, score: quality, signature, explicitCount: hasExplicitCount });
                pending.push(payload);
                if (payload.category === 'comment') {
                    diag('collector.push', 'push.queued', diagPayload(payload, {
                        signature,
                        coarseSignature,
                        quality,
                        pendingLength: pending.length,
                    }));
                }
                if (payload.category === 'gift') {
                    if (!payloadHasExplicitGiftCount(payload)) {
                        scheduleFlush(isGiftPayloadReady(payload) ? 80 : GIFT_PENDING_FLUSH_DELAY_MS);
                        return;
                    }
                    void flush();
                    return;
                }
                if (pending.length >= flushImmediateThreshold) {
                    void flush();
                    return;
                }
                scheduleFlush();
            };
            const scheduleGiftRetry = (element, source = 'generic', delayMs = 140) => {
                const scopedElement = findChatItemRoot(element);
                if (!(scopedElement instanceof HTMLElement)) {
                    return;
                }
                const retryCount = giftRetryCounts.get(scopedElement) || 0;
                if (retryCount >= 5) {
                    return;
                }
                giftRetryCounts.set(scopedElement, retryCount + 1);
                const handle = window.setTimeout(() => {
                    void handle;
                    digestElement(scopedElement, `${source}-retry`);
                }, delayMs);
                cleanupHandles.push(handle);
            };
            const digestElement = (element, source = 'generic') => {
                const scopedElement = findChatItemRoot(element);
                const rawText = visibleText(scopedElement);
                if (!rawText && !looksLikeGiftElement(scopedElement)) {
                    diag('collector.digest', 'digest.empty_text', {
                        category: 'comment',
                        rawText,
                        text: '',
                        source,
                    });
                    return;
                }
                const text = rawText || normalize(collectTextFragments(scopedElement, 12).join(' '));
                if (skip(text) && !looksLikeGiftElement(scopedElement)) {
                    diag('collector.digest', 'digest.skip_text', {
                        category: 'comment',
                        rawText,
                        text,
                        source,
                    });
                    return;
                }
                const reactData = collectReactMessageData(scopedElement);
                const category = classify(text, scopedElement, reactData);
                if (category === 'gift') {
                    diag('collector.digest', 'digest.classified_gift_return', {
                        category,
                        rawText,
                        text,
                        sourceId: reactData.sourceId || undefined,
                        source,
                        hasReactPayload: Boolean(reactData.payload),
                    });
                    return;
                }
                const parsed = parseUser(scopedElement, text, category);
                const insideChatRoot = isInsideChatRoot(scopedElement) || source.startsWith('chat');
                const hasGiftSignal = containsGiftSignal(text) || looksLikeGiftElement(scopedElement);
                const isSelfProfile = parsed.userId === 'self' || /\/user\/self(?:[/?]|$)/iu.test(parsed.userLink || '');
                const actionOnlyGiftText = /^(.{1,24}?)(?:[\uFF1A:]\s*|\s+)?(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001)\s*(?:[xX\u00D7*]\s*\d{1,5}|\d{1,5}\s*\u8FDE\u51FB|\d{1,5}\s*(?:\u4E2A|\u4EFD|\u5F20))\s*$/u.test(text);
                if (isSelfProfile && !insideChatRoot) {
                    return;
                }
                if (category === 'gift' &&
                    !insideChatRoot &&
                    !reactData.payload &&
                    !/^(.{1,24}?)(?:[\uFF1A:]\s*|\s+)?(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001)\s+.+$/u.test(text) &&
                    !/^(.{1,24}?)(?:[\uFF1A:]\s*|\s+)?(?:\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968.*)$/u.test(text)) {
                    return;
                }
                if (category === 'gift' && !parsed.giftName && !reactData.payload && (!insideChatRoot || !hasGiftSignal || !parsed.userName)) {
                    return;
                }
                if (category === 'gift' && actionOnlyGiftText && !parsed.giftName) {
                    return;
                }
                if (category === 'gift' && /(未成年人直播|理性消费|谨防网络诈骗)/u.test(text)) {
                    return;
                }
                if (category === 'gift' && parsed.userName && /^\d+\u94BB$/u.test(parsed.userName)) {
                    return;
                }
                if (category === 'gift' && parsed.userName === '\u9001' && !parsed.userId && !parsed.userLink) {
                    return;
                }
                const isPureCountdownComment = /^(?:(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\(?\s*\d{1,4}\s*(?:s|S|\u79D2|\u79D2\u949F)\s*\)?)$/iu.test(parsed.displayText || text);
                const compactCommentText = normalize(text).replace(/\s+/g, '');
                const isProfileIdCountdownText = /^(?:.*?(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}.*?[\uFF1A:])\(?\s*(?:(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\d{1,4}(?:s|S|\u79D2|\u79D2\u949F))\s*\)?$/iu.test(compactCommentText);
                if (category === 'comment' && (isPureCountdownComment || isProfileIdCountdownText)) {
                    diag('collector.digest', 'digest.comment_countdown_noise', {
                        category,
                        rawText,
                        text,
                        sourceId: reactData.sourceId || undefined,
                        userName: parsed.userName,
                        userId: parsed.userId,
                        userLink: parsed.userLink,
                        insideChatRoot,
                        hasReactPayload: Boolean(reactData.payload),
                    });
                    return;
                }
                if ((category === 'gift' || category === 'comment') &&
                    !reactData.payload &&
                    countMatches(text, /[:\uFF1A]/gu) > 4) {
                    diag('collector.digest', 'digest.too_many_colons_without_payload', {
                        category,
                        rawText,
                        text,
                        sourceId: reactData.sourceId || undefined,
                        userName: parsed.userName,
                        userId: parsed.userId,
                        userLink: parsed.userLink,
                        insideChatRoot,
                        hasReactPayload: false,
                    });
                    return;
                }
                if (category !== 'comment' &&
                    category !== 'gift' &&
                    !parsed.userName &&
                    !parsed.userLink &&
                    !parsed.userId) {
                    return;
                }
                if (category === 'gift' &&
                    !parsed.userName &&
                    !parsed.userLink &&
                    !parsed.userId &&
                    !parsed.giftName &&
                    !hasGiftSignal) {
                    return;
                }
                if (category === 'gift' && /^x\s*\d{1,5}$/iu.test(text) && !parsed.userName && !parsed.giftName) {
                    return;
                }
                if (category === 'comment' && !insideChatRoot && !/[:\uFF1A]/u.test(text) && !parsed.userLink) {
                    diag('collector.digest', 'digest.outside_chat_no_colon', {
                        category,
                        rawText,
                        text,
                        sourceId: reactData.sourceId || undefined,
                        userName: parsed.userName,
                        userId: parsed.userId,
                        userLink: parsed.userLink,
                        insideChatRoot,
                        hasReactPayload: Boolean(reactData.payload),
                        reasonDetail: 'missing_colon_and_link',
                    });
                    return;
                }
                if (category === 'comment' &&
                    parsed.displayText === text &&
                    !/[:\uFF1A]/u.test(text) &&
                    !parsed.userLink &&
                    !insideChatRoot) {
                    diag('collector.digest', 'digest.outside_chat_no_colon', {
                        category,
                        rawText,
                        text,
                        sourceId: reactData.sourceId || undefined,
                        userName: parsed.userName,
                        userId: parsed.userId,
                        userLink: parsed.userLink,
                        insideChatRoot,
                        hasReactPayload: Boolean(reactData.payload),
                        reasonDetail: 'display_text_unchanged',
                    });
                    return;
                }
                const payload = {
                    category,
                    sourceId: reactData.sourceId || undefined,
                    rawText: text,
                    text: parsed.displayText,
                    userName: parsed.userName,
                    userId: parsed.userId,
                    userLink: parsed.userLink,
                    giftName: parsed.giftName,
                    giftCount: parsed.giftCount,
                };
                const giftPayloadReady = category === 'gift' ? isGiftPayloadReady(payload) : false;
                if (category === 'gift' &&
                    !giftPayloadReady &&
                    (hasGiftSignal || reactData.payload || looksLikeGiftElement(scopedElement))) {
                    scheduleGiftRetry(scopedElement, source, source.includes('retry') ? 220 : 120);
                }
                const elementFingerprint = makeElementFingerprint(payload);
                if (category !== 'gift' && !shouldDigestElement(scopedElement, elementFingerprint)) {
                    diag('collector.digest', 'digest.same_element_fingerprint', diagPayload(payload, {
                        signature: elementFingerprint,
                        insideChatRoot,
                        hasReactPayload: Boolean(reactData.payload),
                    }));
                    return;
                }
                if (category === 'gift' && giftPayloadReady && !shouldDigestElement(scopedElement, elementFingerprint)) {
                    return;
                }
                if (category === 'gift') {
                    stageGiftPayload(scopedElement, payload);
                    return;
                }
                push(payload);
            };
                const collectDigestTargets = (node, source = 'generic') => {
                    if (!(node instanceof HTMLElement)) {
                        return [];
                    }
                const targets = [];
                const visited = new Set();
                const addTarget = (candidate) => {
                    if (!(candidate instanceof HTMLElement)) {
                        return;
                    }
                    const scopedTarget = findChatItemRoot(candidate);
                    if (!(scopedTarget instanceof HTMLElement) || visited.has(scopedTarget)) {
                        return;
                    }
                    if (source === 'chat' && scopedTarget === node && !scopedTarget.matches(chatItemSelector)) {
                        return;
                    }
                    visited.add(scopedTarget);
                    targets.push(scopedTarget);
                };
                addTarget(node);
                const selector = source === 'chat'
                    ? chatItemSelector
                    : `${chatItemSelector},[class*="message"],[class*="comment"],[class*="gift"],[class*="chat"]`;
                const limit = source === 'chat' ? 24 : 12;
                const scopedElements = Array.from(node.querySelectorAll(selector));
                const sampledElements = source === 'chat'
                    ? scopedElements.slice(-limit)
                    : scopedElements.slice(0, limit);
                for (const element of sampledElements) {
                    addTarget(element);
                }
                return targets;
            };
            const walkNode = (node, source = 'generic') => {
                if (!(node instanceof HTMLElement)) {
                    return;
                }
                const targets = collectDigestTargets(node, source);
                for (const element of targets) {
                    digestElement(element, source);
                }
            };
            const attachObserver = (root, source) => {
                if (!(root instanceof Node)) {
                    return null;
                }
                const observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        mutation.addedNodes.forEach((node) => walkNode(node, source));
                        if (mutation.target instanceof HTMLElement) {
                            walkNode(mutation.target, source);
                        }
                        else if (mutation.target instanceof Text && mutation.target.parentElement) {
                            walkNode(mutation.target.parentElement, source);
                        }
                    }
                });
                const isChatSource = source === 'chat' || source === 'chat-fast';
                observer.observe(root, {
                    childList: true,
                    subtree: true,
                    characterData: isChatSource,
                    attributes: isChatSource,
                    attributeFilter: isChatSource ? ['class', 'href', 'alt', 'title', 'aria-label', 'data-e2e'] : undefined,
                });
                return observer;
            };
            const observers = [];
            const ensureGiftMessageBridge = () => {
                attachGiftMessageBridge();
            };
            ensureGiftMessageBridge();
            const chatRoots = findChatRoots();
            for (const root of chatRoots) {
                const observer = attachObserver(root, 'chat');
                if (observer) {
                    observers.push(observer);
                }
                walkNode(root, 'chat');
            }
            const bodyObserver = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    mutation.addedNodes.forEach((node) => walkNode(node, 'generic'));
                }
            });
            bodyObserver.observe(document.body, { childList: true, subtree: false });
            observers.push(bodyObserver);
            const bootstrapScan = () => {
                const roots = findChatRoots();
                if (roots.length) {
                    for (const root of roots) {
                        const recentRows = Array.from(root.querySelectorAll(chatItemSelector)).slice(-10);
                        if (recentRows.length) {
                            for (const row of recentRows) {
                                if (row instanceof HTMLElement) {
                                    digestElement(row, 'chat');
                                }
                            }
                            continue;
                        }
                        walkNode(root, 'chat');
                    }
                    return;
                }
                const seeds = Array.from(document.querySelectorAll('li,[role="listitem"],[data-e2e],[class*="chat"],[class*="comment"],[class*="message"],[class*="gift"]')).slice(-50);
                for (const seed of seeds) {
                    if (seed instanceof HTMLElement) {
                        digestElement(seed, 'generic');
                    }
                }
            };
            bootstrapScan();
            cleanupHandles.push(window.setInterval(ensureGiftMessageBridge, 2500));
            cleanupHandles.push(window.setInterval(bootstrapScan, 2500));
            cleanupHandles.push(window.setInterval(() => {
                const roots = findChatRoots();
                for (const root of roots) {
                    const recentRows = Array.from(root.querySelectorAll(chatItemSelector)).slice(-80);
                    for (const row of recentRows) {
                        if (row instanceof HTMLElement) {
                            digestElement(row, 'chat-fast');
                        }
                    }
                }
            }, 250));
            cleanupHandles.push(window.setInterval(cleanupSeen, 5000));
            windowAny.__douyinCollectorCleanup = () => {
                observers.forEach((observer) => observer?.disconnect());
                cleanupHandles.forEach((handle) => window.clearInterval(handle));
                messageCleanupHandles.forEach((dispose) => {
                    try {
                        dispose();
                    }
                    catch {
                        // Ignore teardown failures on unstable pages.
                    }
                });
                if (flushTimer) {
                    window.clearTimeout(flushTimer);
                    flushTimer = 0;
                }
                pending.length = 0;
                pendingCoarseKeys.clear();
                delete windowAny.__douyinCollectorGiftBridgeInstalled;
                windowAny.__douyinCollectorInstalled = false;
                delete windowAny.__douyinCollectorCleanup;
            };
        }, {
            giftKeywords: GIFT_KEYWORDS,
            flushDelayMs: BATCH_FLUSH_DELAY_MS,
            flushImmediateThreshold: BATCH_FLUSH_IMMEDIATE_THRESHOLD,
        });
    }
    async notifyFatal(error) {
        if (this.fatalNotified) {
            return;
        }
        this.fatalNotified = true;
        await this.callbacks.onStatus(error.message, 'error');
        await this.stop('fatal');
        await this.callbacks.onFatal(error);
    }
}

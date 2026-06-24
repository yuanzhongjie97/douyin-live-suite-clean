import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import { config } from './config.js';
import { CaptureService } from './capture-service.js';
import { AppDatabase } from './db.js';
import { commentDiagnostics } from './comment-diagnostics.js';
import {
  createLocalApiToken,
  hasValidLocalApiToken,
  isAllowedLocalApiOrigin,
  isCrossSiteStateChangingRequest,
  normalizeAllowedDouyinEntryUrl,
  normalizeAllowedDouyinLiveUrl,
  serializeLocalApiCookie,
} from './security.js';
import type { EventCategory } from './types.js';

export interface ServerRuntime {
  app: FastifyInstance;
  service: CaptureService;
  url: string;
  close: () => Promise<void>;
}

let runtime: ServerRuntime | null = null;

const INDEX_HTML_CACHE_CONTROL = 'no-store, no-cache, must-revalidate';
const HASHED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function isIndexHtmlPath(filePath: string): boolean {
  return /(?:^|[/\\])index\.html$/iu.test(filePath);
}

function isHashedAssetPath(filePath: string): boolean {
  return /[/\\]assets[/\\]/iu.test(filePath);
}

export async function registerWebStaticShell(app: FastifyInstance, webDistDir: string, localApiToken: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: webDistDir,
    prefix: '/',
    wildcard: false,
    cacheControl: false,
    setHeaders: (response, filePath) => {
      if (isIndexHtmlPath(filePath)) {
        response.setHeader('Cache-Control', INDEX_HTML_CACHE_CONTROL);
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Expires', '0');
        response.setHeader('Set-Cookie', serializeLocalApiCookie(localApiToken));
        return;
      }
      if (isHashedAssetPath(filePath)) {
        response.setHeader('Cache-Control', HASHED_ASSET_CACHE_CONTROL);
      }
    },
  });

  app.get('/assets/*', async (_request, reply) => reply.status(404).send({ message: 'Asset not found' }));

  app.get('/*', async (_request, reply) => {
    reply.header('Cache-Control', INDEX_HTML_CACHE_CONTROL);
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    reply.header('Set-Cookie', serializeLocalApiCookie(localApiToken));
    return reply.sendFile('index.html', {
      cacheControl: false,
      etag: false,
      lastModified: false,
    });
  });
}

export async function buildApp(options: { localApiToken?: string } = {}): Promise<{ app: FastifyInstance; service: CaptureService }> {
  const app = Fastify({ logger: true });
  const db = new AppDatabase(config.databasePath);
  const service = new CaptureService(db);
  const localApiToken = options.localApiToken ?? createLocalApiToken();

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, isAllowedLocalApiOrigin(origin));
    },
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/')) {
      return;
    }

    if (request.headers.origin && !isAllowedLocalApiOrigin(request.headers.origin)) {
      return reply.status(403).send({ message: '非法来源请求已拒绝。' });
    }

    if (
      isCrossSiteStateChangingRequest({
        method: request.method,
        origin: request.headers.origin,
        secFetchSite: request.headers['sec-fetch-site'],
      })
    ) {
      return reply.status(403).send({ message: '非法跨站请求已拒绝。' });
    }

    if (!hasValidLocalApiToken(request.headers, localApiToken)) {
      return reply.status(401).send({ message: '本地接口未授权。' });
    }
  });

  if (existsSync(config.webDistDir)) {
    await registerWebStaticShell(app, config.webDistDir, localApiToken);
  }

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/sessions', async (request) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
      })
      .parse(request.query);

    return {
      items: service.getSessions(query.limit ?? 20),
    };
  });

  app.get('/api/sessions/active', async () => service.getRuntimeSnapshot());

  app.post('/api/sessions/start', async (request, reply) => {
    const body = z
      .object({
        url: z.string().url(),
      })
      .parse(request.body);
    const targetUrl = normalizeAllowedDouyinLiveUrl(body.url);
    if (!targetUrl) {
      return reply.status(400).send({ message: '只允许采集抖音直播间 HTTPS 地址。' });
    }

    try {
      const session = await service.start(targetUrl);
      return { session };
    } catch (error) {
      return reply.status(409).send({
        message: error instanceof Error ? error.message : '启动失败',
      });
    }
  });

  app.post('/api/sessions/stop', async () => {
    await service.stop({ autoSave: 'manual' });
    return { ok: true };
  });

  app.get('/api/browser/state', async () => service.getBrowserState());

  app.post('/api/browser/login', async (request, reply) => {
    const body = z
      .object({
        url: z.string().url().optional(),
      })
      .parse(request.body);
    const targetUrl = body.url ? normalizeAllowedDouyinEntryUrl(body.url) : undefined;
    if (body.url && !targetUrl) {
      return reply.status(400).send({ message: '只允许打开抖音 HTTPS 页面。' });
    }

    try {
      await service.openLoginWindow(targetUrl);
      return { ok: true };
    } catch (error) {
      return reply.status(409).send({
        message: error instanceof Error ? error.message : '打开登录窗口失败',
      });
    }
  });

  app.post('/api/browser/login/close', async () => {
    await service.closeLoginWindow();
    return { ok: true };
  });

  app.post('/api/users/resolve-profile', async (request, reply) => {
    const body = z
      .object({
        userName: z.string().optional(),
        userId: z.string().optional(),
        userLink: z.string().optional(),
        rawText: z.string().optional(),
        message: z.string().optional(),
      })
      .parse(request.body);

    try {
      return await service.resolveUserProfile(body);
    } catch (error) {
      return reply.status(409).send({
        message: error instanceof Error ? error.message : '解析用户主页失败',
      });
    }
  });

  app.post('/api/users/open-profile', async (request, reply) => {
    const body = z
      .object({
        userName: z.string().optional(),
        userId: z.string().optional(),
        userLink: z.string().optional(),
        rawText: z.string().optional(),
        message: z.string().optional(),
      })
      .parse(request.body);

    try {
      return await service.openUserProfile(body);
    } catch (error) {
      return reply.status(409).send({
        message: error instanceof Error ? error.message : '打开用户主页失败',
      });
    }
  });

  app.get('/api/events', async (request) => {
    const query = z
      .object({
        sessionId: z.string().optional(),
        category: z
          .enum(['comment', 'entry', 'interaction', 'gift', 'log'] satisfies [
            EventCategory,
            ...EventCategory[],
          ])
          .optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
      })
      .parse(request.query);

    return {
      items: service.getEvents(query),
    };
  });

  app.get('/api/events/history', async (request) => {
    const query = z
      .object({
        sessionId: z.string(),
        category: z.enum(['comment', 'gift']),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        cursorCreatedAt: z.string().optional(),
        cursorId: z.coerce.number().int().optional(),
        q: z.string().trim().max(80).optional(),
      })
      .parse(request.query);

    return service.getEventHistory(query);
  });

  app.get('/api/diagnostics/comment-flow', async () => commentDiagnostics.snapshot());

  app.get('/api/diagnostics/capture-integrity', async () => commentDiagnostics.snapshot());

  app.post('/api/diagnostics/comment-flow/reset', async () => {
    commentDiagnostics.reset();
    return { ok: true };
  });

  app.get('/api/diagnostics/events', async (request) => {
    const query = z
      .object({
        sessionId: z.string(),
        category: z
          .enum(['comment', 'entry', 'interaction', 'gift', 'log'] satisfies [
            EventCategory,
            ...EventCategory[],
          ])
          .optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
      })
      .parse(request.query);

    commentDiagnostics.increment('api.events.requested');
    if (query.category === 'comment') {
      commentDiagnostics.increment('api.events.comment_requested');
    }
    return {
      items: service.getEvents(query),
    };
  });

  app.get('/api/stats', async (request) => {
    const query = z
      .object({
        sessionId: z.string().optional(),
      })
      .parse(request.query);

    return service.getStats(query.sessionId);
  });


  app.get('/api/highlight-users', async (request) => {
    const query = z
      .object({
        sessionId: z.string().optional(),
        includeMatched: z.coerce.boolean().optional(),
      })
      .parse(request.query);

    return service.getHighlightUsers(query);
  });
  app.get('/api/export.xlsx', async (request, reply) => {
    const query = z
      .object({
        sessionId: z.string().optional(),
      })
      .parse(request.query);

    const { fileName, buffer } = await service.exportSessionWorkbook(query.sessionId);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(buffer);
  });

  app.get('/api/events/stream', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    let streamClosed = false;
    let pendingEvents: unknown[] = [];
    let flushTimer: NodeJS.Timeout | null = null;

    const send = (payload: unknown): boolean => {
      if (streamClosed || reply.raw.destroyed || reply.raw.writableEnded) {
        return false;
      }
      try {
        const ok = reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
        if (!ok) {
          commentDiagnostics.increment('sse.write_false');
        }
        return ok;
      } catch {
        streamClosed = true;
        return false;
      }
    };

    const flushEvents = () => {
      flushTimer = null;
      if (!pendingEvents.length || streamClosed) {
        return;
      }
      const payload = pendingEvents;
      pendingEvents = [];
      const commentCount = payload.filter((item) => {
        return Boolean(item) && typeof item === 'object' && (item as { category?: unknown }).category === 'comment';
      }).length;
      commentDiagnostics.increment('sse.flushed_events', payload.length);
      commentDiagnostics.increment('sse.comment_flushed_events', commentCount);
      commentDiagnostics.record({
        stage: 'sse.flush',
        reason: 'flushed_events',
        extra: { count: payload.length, commentCount },
      });
      send({ type: 'events', payload });
    };

    const queueEvent = (payload: unknown) => {
      if (streamClosed) {
        commentDiagnostics.increment('sse.closed_before_queue');
        return;
      }
      commentDiagnostics.increment('sse.queue');
      if (Boolean(payload) && typeof payload === 'object' && (payload as { category?: unknown }).category === 'comment') {
        commentDiagnostics.increment('sse.comment_queue');
      }
      pendingEvents.push(payload);
      if (pendingEvents.length >= 12) {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushEvents();
        return;
      }
      if (!flushTimer) {
        flushTimer = setTimeout(flushEvents, 12);
      }
    };

    send({ type: 'session', payload: service.getRuntimeSnapshot() });

    const unsubscribe = service.bus.subscribe((message) => {
      if (streamClosed) {
        commentDiagnostics.increment('sse.closed_before_queue');
        return;
      }
      if (message.type === 'event') {
        const eventPayload = message.payload as { category?: unknown };
        commentDiagnostics.increment('sse.event_seen');
        if (eventPayload.category === 'comment') {
          commentDiagnostics.increment('sse.comment_event_seen');
        }
        queueEvent(message.payload);
        return;
      }
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushEvents();
      send(message);
    });

    const heartbeat = setInterval(() => {
      if (streamClosed || reply.raw.destroyed || reply.raw.writableEnded) {
        return;
      }
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        streamClosed = true;
      }
    }, 15000);

    const cleanup = () => {
      streamClosed = true;
      clearInterval(heartbeat);
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingEvents = [];
      unsubscribe();
    };

    reply.raw.on('error', cleanup);
    request.raw.on('close', cleanup);
  });

  return { app, service };
}

export async function startServer(options?: { host?: string; port?: number }): Promise<ServerRuntime> {
  if (runtime) {
    return runtime;
  }

  const { app, service } = await buildApp();
  const host = options?.host ?? config.host;
  const port = options?.port ?? config.port;

  await app.listen({ host, port });

  runtime = {
    app,
    service,
    url: `http://${host}:${port}`,
    close: async () => {
      await service.shutdown();
      await app.close();
      runtime = null;
    },
  };

  return runtime;
}

async function shutdown(): Promise<void> {
  if (!runtime) {
    process.exit(0);
    return;
  }
  await runtime.close();
  process.exit(0);
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await startServer();

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

// src/index.ts
import * as dotenv from 'dotenv';
dotenv.config({ override: true }); // .env always wins

import express, { Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import { registerSearchTool } from './tools/search.js';
import { registerFetchTool } from './tools/fetch.js';
import { registerTranscribeTool } from './tools/transcribe.js';
import { registerSummarizeTool } from './tools/summarize.js';
import { UpstreamRegistry } from './lib/upstreams.js';

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

async function main() {
  const PORT = parseInt(process.env.PORT || '8787', 10);
  const API_KEY_RAW = process.env.MCP_GATEWAY_API_KEY ?? '';
  const API_KEY = API_KEY_RAW.trim();

  console.log('[boot] API key len=%d head=%s tail=%s',
    API_KEY.length, API_KEY.slice(0, 2), API_KEY.slice(-2));

  const app = express();
  app.disable('x-powered-by');
  app.use(morgan('tiny'));
  app.use(express.json({ limit: '10mb' })); // global JSON (we also set a specific parser on /messages below)

  // Shared registry
  const upstreams = new UpstreamRegistry();

  // Basic auth middleware for non-SSE routes (Bearer or X-API-Key)
  const auth = (req: Request, res: Response, next: NextFunction) => {
    if (!API_KEY) return next();
    const raw = String(req.headers['authorization'] || req.headers['x-api-key'] || '');
    const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
    if (!token) return res.status(401).send('Missing token');
    if (token !== API_KEY) return res.status(403).send('Invalid token');
    next();
  };

  // Load upstream config (optional; ignore if file missing)
  try {
    upstreams.loadFromEnv(process.env.UPSTREAM_URLS || '');
    await upstreams.loadFromFile(path.resolve(process.cwd(), 'upstreams.json'));
  } catch (e) {
    console.warn('[WARN] upstreams not loaded:', (e as any)?.message || e);
  }

  // MCP server + tools
  const server = new McpServer({ name: 'remote-mcp-gateway', version: '0.1.0' });
  registerSearchTool(server, { upstreams });
  registerFetchTool(server, { upstreams });
  registerTranscribeTool(server, { upstreams });
  registerSummarizeTool(server, { upstreams });

  // Health
  app.get('/health', (_req: Request, res: Response) => res.json({ ok: true }));

  // === SSE wiring (current SDK expects an SSE stream and a messages POST endpoint) ===
  let transport: SSEServerTransport | undefined;

  // Start SSE stream (authenticate here)
  app.get('/sse', async (req: Request, res: Response) => {
    try {
      if (API_KEY) {
        const raw = String(req.headers['authorization'] || req.headers['x-api-key'] || '');
        const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
        console.log('[SSE] headerLen=%d tokenLen=%d tokenHead=%s tokenTail=%s',
          raw.length, token.length, token.slice(0, 2), token.slice(-2));
        if (token !== API_KEY) {
          res.status(401).type('text/plain').end('Unauthorized');
          return;
        }
      }

      // IMPORTANT: use (messagesPath, res) – NOT {req,res}
      transport = new SSEServerTransport('/messages', res);

      // Don’t await forever; let SDK manage the stream
      server.connect(transport).catch((err) => {
        console.error('[SSE] connect error:', err);
        try { res.end(); } catch {}
      });
    } catch (err) {
      console.error('[SSE] handler error:', err);
      try { res.status(500).end('SSE error'); } catch {}
    }
  });

  // Forward messages to the transport. Use a dedicated parser here.
  app.post(
    '/messages',
    express.json({ type: '*/*', limit: '10mb' }),
    async (req: Request, res: Response) => {
      try {
        if (!transport) {
          res.status(503).send('SSE not established');
          return;
        }
        await transport.handlePostMessage(req, res);
      } catch (err) {
        console.error('[messages] error:', err);
        res.status(500).end('messages error');
      }
    }
  );

  // Simple ingest helper
  app.post('/ingest', auth, async (req: Request, res: Response) => {
    const { id, text, meta } = (req.body || {}) as { id?: string; text?: string; meta?: Record<string, any> };
    if (!text) return res.status(400).json({ error: 'text required' });
    const docId = id || uuidv4();
    await upstreams.storeDocument(docId, text, meta || {});
    res.json({ id: docId });
  });

  const srv = app.listen(PORT, () => {
    console.log(`[remote-mcp-gateway] listening on :${PORT} (SSE at /sse)`);
  });

  srv.on('error', (err) => {
    console.error('[listen] error:', err);
    process.exitCode = 1;
  });
}

main().catch((err) => {
  console.error('[main] fatal:', err);
  process.exit(1);
});


import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UpstreamRegistry } from '../lib/upstreams.js';
import { v4 as uuidv4 } from 'uuid';

type Opts = { upstreams: UpstreamRegistry };

export function registerTranscribeTool(server: McpServer, opts: Opts) {
  server.registerTool(
    'transcribe',
    {
      title: 'Transcribe',
      description: 'Transcribe an audio file via an upstream STT. Returns a document id.',
      inputSchema: {
        audio_url: z.string().describe('Public or signed URL to audio'),
        upload_id: z.string().optional(),
        meta: z.record(z.string(), z.any()).optional()
      },
      outputSchema: z.object({ id: z.string(), status: z.string(), text_preview: z.string().optional() })
    },
    async ({ audio_url, upload_id, meta }) => {
      if (!audio_url) throw new Error('audio_url is required');

      // TODO: swap this placeholder for a real STT call
      const fakeTranscript = `TRANSCRIPT for ${audio_url} (replace with real STT)`;
      const id = upload_id || uuidv4();
      await opts.upstreams.storeDocument(id, fakeTranscript, meta || {});

      return {
        content: [{ type: 'text', text: JSON.stringify({ id, status: 'ok' }) }],
        structuredContent: { id, status: 'ok', text_preview: fakeTranscript.substring(0, 120) }
      };
    }
  );
}

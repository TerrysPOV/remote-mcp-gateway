import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UpstreamRegistry } from '../lib/upstreams.js';

type Opts = { upstreams: UpstreamRegistry };

export function registerSummarizeTool(server: McpServer, opts: Opts) {
  server.registerTool(
    'summarize',
    {
      title: 'Summarize',
      description: 'Summarize a transcript by id or direct text. Returns a structured summary.',
      inputSchema: { id: z.string().optional(), text: z.string().optional(), style: z.enum(['exec', 'actions']).optional() },
      outputSchema: z.object({
        bullets: z.array(z.string()),
        decisions: z.array(z.string()).optional(),
        next_actions: z.array(z.string()).optional()
      })
    },
    async ({ id, text, style }) => {
      let content = (text ?? '').trim();
      if (!content && id) {
        const docs = await opts.upstreams.fetch([id]);
        if (!docs.length || !docs[0]?.text) throw new Error('document not found');
        content = String(docs[0].text).trim();
      }
      if (!content) throw new Error('id or text is required');

      const firstLine = content.split('\n').find(l => l.trim().length > 0) ?? content.slice(0, 120);
      const preview = firstLine.substring(0, 120);

      const sentences = content
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean);

      const bullets = [`Summary preview: ${preview}`, ...sentences.slice(0, 3).map(s => `• ${s}`)];
      const decisions: string[] = [];
      const next_actions: string[] = [];

      if (style === 'actions') {
        next_actions.push('Identify owners and due dates for key items.');
        next_actions.push('Share summary with attendees and track follow-ups.');
      }

      const output = { bullets, decisions, next_actions };
      return { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output };
    }
  );
}

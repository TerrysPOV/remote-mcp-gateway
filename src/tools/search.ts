import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UpstreamRegistry } from '../lib/upstreams.js';

export function registerSearchTool(server: McpServer, opts: { upstreams: UpstreamRegistry }) {
  server.registerTool(
    'search',
    {
      title: 'Search',
      description: 'Search indexed transcripts and notes. Returns ids and snippets.',
      inputSchema: { query: z.string(), top_k: z.number().optional() },
      outputSchema: z.array(z.object({ id: z.string(), score: z.number(), snippet: z.string() }))
    },
    async ({ query, top_k }) => {
      const results = await opts.upstreams.search(query, top_k ?? 5);
      return {
        content: [{ type: 'text', text: JSON.stringify(results) }],
        structuredContent: results
      };
    }
  );
}

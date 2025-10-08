import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { UpstreamRegistry } from '../lib/upstreams.js';

export function registerFetchTool(server: McpServer, opts: { upstreams: UpstreamRegistry }) {
  server.registerTool(
    'fetch',
    {
      title: 'Fetch',
      description: 'Fetch full documents by id.',
      inputSchema: { ids: z.array(z.string()) },
      outputSchema: z.array(z.object({ id: z.string(), text: z.string(), meta: z.record(z.string(), z.any()).optional() }))
    },
    async ({ ids }) => {
      const docs = await opts.upstreams.fetch(ids);
      return {
        content: [{ type: 'text', text: JSON.stringify(docs) }],
        structuredContent: docs
      };
    }
  );
}

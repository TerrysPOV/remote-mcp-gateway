import fs from 'fs/promises';
import fetch from 'node-fetch';

type Doc = { id: string; text: string; meta?: Record<string, any> };
type Upstream = { label: string; url: string };

export class UpstreamRegistry {
  private upstreams: Upstream[] = [];
  private docs: Map<string, Doc> = new Map();

  loadFromEnv(csv: string) {
    if (!csv) return;
    csv.split(',').map(s => s.trim()).filter(Boolean).forEach((url, i) => {
      this.upstreams.push({ label: `upstream_${i+1}`, url });
    });
  }

  async loadFromFile(path: string) {
    try {
      const buf = await fs.readFile(path, 'utf-8');
      const j = JSON.parse(buf);
      if (Array.isArray(j.servers)) {
        for (const s of j.servers) {
          if (s.url) this.upstreams.push({ label: s.label || s.url, url: s.url });
        }
      }
    } catch {
      // optional file
    }
  }

  getUpstreams() { return this.upstreams; }

  async storeDocument(id: string, text: string, meta: Record<string, any>) {
    this.docs.set(id, { id, text, meta });
  }

  async search(query: string, top_k: number = 5) {
    // naive in-memory search; replace with vector DB if needed
    const items = Array.from(this.docs.values());
    const scored = items.map(d => ({
      id: d.id,
      score: (d.text.match(new RegExp(query, 'ig')) || []).length,
      snippet: d.text.slice(0, 300)
    })).sort((a,b) => b.score - a.score).slice(0, top_k);
    return scored;
  }

  async fetch(ids: string[]) {
    return ids.map(id => this.docs.get(id)).filter(Boolean);
  }
}
export const registry = new UpstreamRegistry();

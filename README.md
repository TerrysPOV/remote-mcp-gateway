# remote-mcp-gateway

A small **HTTP(S) Model Context Protocol (MCP) gateway** that exposes a stream endpoint compatible with modern MCP clients (ChatGPT custom connectors, Claude for VS Code, Continue).

- `GET /sse` — opens the **Server‑Sent Events** stream (server → client)
- `POST /messages` — client → server messages (JSON); pairs with the SSE stream
- `GET /health` — liveness probe
- `POST /ingest` — simple helper to persist text for demo/search (auth protected)

Current tools registered:
- `search(query, top_k?)` — naive text search over stored docs (file‑ or DB‑backed)
- `fetch(ids[])` — fetch full doc(s)
- `transcribe(audio_url, upload_id?, meta?)` — placeholder STT (returns a fake transcript)
- `summarize(id? | text?, style?)` — lightweight heuristic summary

> **Status (Phase 1):** Working local dev server with SSE wiring compatible with modern MCP TS SDK; API‑key auth; file‑backed persistence optional. See Phase 2 roadmap below.

---

## Architecture (current)

```
Client (ChatGPT/Claude/Continue) 
     │
     │  GET /sse      (SSE stream, server → client)
     │  POST /messages (JSON, client → server)
     ▼
Express (Node 20, ESM, tsx)
  ├─ /sse        → new SSEServerTransport('/messages', res) + server.connect(…)
  ├─ /messages   → transport.handlePostMessage(req, res)
  ├─ /ingest     → storeDocument(id,text,meta) [auth]
  └─ /health     → { ok: true }
     │
     ▼
MCP Server ( @modelcontextprotocol/sdk )
  ├─ registerTool('search' | 'fetch' | 'transcribe' | 'summarize')
  └─ structuredContent + text content returned to clients
     │
     ▼
UpstreamRegistry
  ├─ In‑memory store (default)
  ├─ File JSON if `DB_URL=file:./data/docs.json`
  └─ (Phase 2) PostgreSQL for durable persistence & full‑text
```

**Auth model**
- All routes accept **`Authorization: Bearer <MCP_GATEWAY_API_KEY>`** or **`X-API-Key: <MCP_GATEWAY_API_KEY>`**.
- `/sse` **requires** the key if configured; `/messages` depends on the established transport created by `/sse`.

**Env & runtime**
- Node 20+, ESM (`moduleResolution=Bundler`), TypeScript + `tsx` for dev, Zod for schemas.
- The gateway does **not** implement upstream OAuth yet; Phase 2 adds an ADMIN API and tiny admin UI.

---

## Quick start (local)

```bash
# 1) Install deps
npm i

# 2) Create .env (example)
cat > .env <<'EOF'
MCP_GATEWAY_API_KEY=changeme-16-24chars
PORT=8787
DB_URL=file:./data/docs.json

# optional: pre-seed upstream MCP servers (comma separated SSE URLs)
# UPSTREAM_URLS=https://server.smithery.ai/@jlia0/servers/mcp
EOF

# 3) Dev
npm run dev

# 4) Health
curl -s http://localhost:8787/health
# -> {"ok":true}

# 5) Open SSE (should 200 and HANG OPEN)
KEY="$(awk -F= '/^MCP_GATEWAY_API_KEY=/{print $2}' .env | tr -d '\r\n')"
curl -v -N -H "Authorization: Bearer $KEY" http://localhost:8787/sse
```

> The POST `/messages` endpoint is used by MCP clients; simulating a full JSON‑RPC handshake by hand is cumbersome. For cURL verification, validate:
> - `/sse` returns **200** and keeps the stream open
> - `/messages` returns **503** **before** SSE is established; **204/200** after the SSE stream exists (payload depends on MCP client)
> - wrong/absent key on `/sse` yields **401**

### Ingest + search demo

```bash
# write text
curl -s -X POST http://localhost:8787/ingest \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"text":"Kickoff: Remote MCP Gateway is running; verify search and fetch endpoints."}'

# (tools invocation is driven by the MCP client; /messages is not intended for manual curl payloads)
```

---

## Git: stage, commit, push (new repo)

```bash
git init
git add -A
git commit -m "feat: initial working MCP gateway (SSE + /messages, tools, auth)"
git branch -M main
git remote add origin git@github.com:TerrysPOV/remote-mcp-gateway.git
git push -u origin main
```

> If using HTTPS instead of SSH:
> `git remote add origin https://github.com/TerrysPOV/remote-mcp-gateway.git`

---

## Phase 2 — roadmap & tasks

1) **Conformance testing against OpenAI MCP requirements**
   - Configure this upstream via the gateway: `https://server.smithery.ai/@jlia0/servers/mcp`
   - Write **cURL tests** to validate:
     - `/sse` behavior (auth required, long‑lived stream, correct headers, no buffering)
     - `/messages` routing after SSE established
     - Error responses on missing/invalid token
     - Health (`/health`) and auth on `/ingest`
     - Validate with at least one MCP client (ChatGPT custom connector or Claude/Continue) and capture traces. Cloudflare Tunnel will be required for this via:
                                            brew install cloudflare/cloudflare/cloudflared   # or use your package manager
                                            cloudflared tunnel --url http://127.0.0.1:3001   # replace 3001 with your local MCP port
                                            # copy the https URL and add it to UPSTREAM_URLS or your admin UI

2) **PostgreSQL persistence (self‑hosted)**  
   - Install Postgres on droplet:
     ```bash
     sudo apt-get update && sudo apt-get install -y postgresql
     sudo -u postgres psql -c "create user mcp with password 'REDACTED';"
     sudo -u postgres psql -c "create database mcpdb owner mcp;"
     ```
   - Schema:
     ```sql
     create table documents (
       id text primary key,
       text text not null,
       meta jsonb default '{}'::jsonb,
       created_at timestamptz default now(),
       updated_at timestamptz default now(),
       tsv tsvector
     );
     create index on documents using gin (tsv);
     create function documents_tsv_trigger() returns trigger as $$
     begin new.tsv := to_tsvector('english', coalesce(new.text,'')); return new; end $$ language plpgsql;
     create trigger tsv_update before insert or update on documents
     for each row execute function documents_tsv_trigger();
     ```
   - Set `DATABASE_URL=postgres://mcp:REDACTED@localhost:5432/mcpdb` in `.env` and switch the registry to Pg (drop‑in class).

3) **ADMIN API (Bearer `ADMIN_API_KEY`)**
   - `GET /admin/upstreams` → list
   - `POST /admin/upstreams { url, label?, vars? }` → add
   - `DELETE /admin/upstreams { url }` → remove
   - Persist via the same registry/backend. Add basic server‑side validation.

4) **Admin static page (`/admin`)**
   - Single HTML page posting to the ADMIN API; allows adding upstream MCP servers (plain HTTPS URLs) and optional key/value variables (e.g., tokens).  
   - Protect with `ADMIN_API_KEY` (JS adds `Authorization: Bearer …`) and optionally IP‑restrict in Nginx.

5) **Deploy to DigitalOcean droplet (167.71.140.229)**
   - Node 20, `npm ci`, `npm run build`, `node dist/index.js` (or `pm2 start …`).
   - `.env` with prod keys, `PORT=8787`.
   - Open firewall: 80/443. Keep 8787 bound to localhost behind Nginx.

6) **Nginx TLS reverse proxy for `mcp.poview.ai` and `www.mcp.poview.ai`**
   - Example server blocks (Let’s Encrypt + proxy to 127.0.0.1:8787). Ensure SSE is not buffered:
     ```nginx
     server {
       listen 80;
       server_name mcp.poview.ai www.mcp.poview.ai;
       return 301 https://$host$request_uri;
     }

     server {
       listen 443 ssl http2;
       server_name mcp.poview.ai www.mcp.poview.ai;

       ssl_certificate /etc/letsencrypt/live/mcp.poview.ai/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/mcp.poview.ai/privkey.pem;

       location / {
         proxy_pass http://127.0.0.1:8787;
         proxy_http_version 1.1;
         proxy_set_header Host $host;
         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
         proxy_set_header X-Forwarded-Proto $scheme;

         # SSE: do not buffer
         proxy_buffering off;
         proxy_cache off;
         proxy_set_header Cache-Control "no-cache";
         proxy_read_timeout 3600;
         chunked_transfer_encoding off;
       }
     }
     ```
   - Use `certbot --nginx -d mcp.poview.ai -d www.mcp.poview.ai` to obtain/renew certs.

7) **User testing on ChatGPT**
   - Create a ChatGPT **Custom Connector** using:
     - URL: `https://mcp.poview.ai/sse`
     - Header: `Authorization: Bearer <MCP_GATEWAY_API_KEY>`
   - Confirm tools appear and are callable. Capture logs for a few end‑to‑end runs.

---

## Minimal DO droplet spec

- **1 vCPU / 1GB RAM** (Ubuntu 22.04/24.04) is sufficient for the gateway itself.
- If you also run Postgres locally: **1 vCPU / 2GB RAM** is more comfortable.

---

## Why/when persistence matters

You don’t *need* it for a pure “stateless tool broker”. Add persistence if you want:
- search/fetch across restarts,
- multiple nodes to share state,
- an admin UI with history and safe updates.
Otherwise, leave `DB_URL` empty (in‑memory) and skip Postgres.

---

## Env reference

```
MCP_GATEWAY_API_KEY=…   # required for clients
ADMIN_API_KEY=…         # required for /admin/* routes (phase 2)
PORT=8787
DB_URL=file:./data/docs.json  # optional; set DATABASE_URL for Postgres instead
UPSTREAM_URLS=https://example.com/sse,https://another/sse
DOMAIN=mcp.poview.ai
ACME_EMAIL=terry.yodaiken@poview.ai
```

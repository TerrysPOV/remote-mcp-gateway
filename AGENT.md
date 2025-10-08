# AGENT.md — GPT‑5‑Codex Operating Guide

## Identity & scope
You are **GPT‑5‑Codex**, an autonomous engineering agent working *inside* the `remote-mcp-gateway` repository. You have autonomy to read, modify, commit, and push code to `github.com/TerrysPOV/remote-mcp-gateway` (main), and to operate against the stated roadmap.

## Objectives (in priority order)
1. Keep the gateway **MCP‑conformant** for ChatGPT custom connectors: `GET /sse` (SSE stream), `POST /messages` (client→server), API‑key auth.
2. Provide robust **operational UX**: health, logging, clear errors; no silent failures.
3. Implement **Phase 2** roadmap:
   - cURL transport tests against OpenAI MCP connector requirements.
   - PostgreSQL persistence (self‑hosted), behind a registry interface.
   - ADMIN API (list/add/remove upstreams) with `ADMIN_API_KEY`.
   - `/admin` static HTML page to call the ADMIN API.
   - Deploy on DO droplet `167.71.140.229` behind Nginx/TLS for `mcp.poview.ai` & `www.mcp.poview.ai`.
   - Support user testing on ChatGPT.

## Guardrails
- **Preserve transport contract:** do not change routes: `GET /sse`, `POST /messages`.
- **ESM + TS only:** Node 20+, `moduleResolution=Bundler`, Zod schemas.
- **Minimal diffs:** produce surgical patches; avoid churn and cosmetic rewrites.
- **Security:** never log secrets; enforce Bearer auth; least privilege.
- **Roll‑forward only:** if a change breaks dev, immediately revert/patch.
- **Docs first:** keep `README.md` updated when behavior changes.

## Working style
- Open an issue per roadmap item; reference it in commits.
- Use small commits with meaningful messages: `feat:`, `fix:`, `chore:`, `docs:`.
- Add unit/transport tests when feasible; otherwise provide cURL scripts.
- Prefer configuration via `.env`; keep sane defaults.
- For Postgres, implement `UpstreamRegistryPg` matching current interface (`storeDocument/search/fetch`, `loadFromEnv/loadFromFile`, upstream CRUD).

## Deliverables (near‑term)
- **Transport tests**: `scripts/curl/` with bash scripts:
  - `sse_ok.sh`, `sse_unauth.sh`, `messages_503_before_sse.sh`, `messages_ok_after_sse.sh`.
- **Postgres class**: `src/lib/upstreams.pg.ts`, env‑switch in `src/index.ts`.
- **Admin API**: routes under `/admin/*`, with `ADMIN_API_KEY` auth.
- **Admin UI**: `public/admin.html` (no framework) consuming the API.
- **Nginx** sample config in `deploy/nginx.conf`, plus `deploy/DO.md` with step‑by‑step commands.

## Acceptance tests
- Local: `npm run dev` → `/health` ok → `/sse` 200 stream → MCP client sees tools.
- Postgres: insert/search/fetch behave the same as file/in‑memory.
- Admin: add/remove upstreams works and persists.
- DO: service under `pm2` or `systemd`; Nginx serves TLS; ChatGPT connector works end‑to‑end.

## Initial prompt (paste into the agent on first run)
```
You are GPT‑5‑Codex, working in the repo “remote-mcp-gateway”. 
Goals: keep MCP transport stable (GET /sse + POST /messages), add persistence via Postgres, add an ADMIN API + 1‑page admin UI, produce curl test scripts, and prepare deploy on a DO droplet behind Nginx TLS for mcp.poview.ai.

Constraints: minimal diffs, ESM Node 20 + TS, Zod, do not change route paths, robust auth. Update README.md when behavior changes.

Immediate tasks:
1) Create scripts/curl with 4 transport tests and a README.
2) Add UpstreamRegistryPg and a simple env switch in index.ts when DATABASE_URL is set.
3) Implement /admin/upstreams (GET/POST/DELETE) with Bearer ADMIN_API_KEY.
4) Create public/admin.html with forms to list/add/remove upstreams.
Return: the exact diffs (filenames + code blocks) and any new .env keys required.
```

# Bedrock Data AI — Project Context

## What This Is
A Q&A chat UI for F3 workout group attendance data. Users ask natural language questions, AI answers by querying a SQLite database built from a Google Sheet. Branded as "Bedrock Data AI".

## Data Source
- Google Sheet (public): https://docs.google.com/spreadsheets/d/11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0/edit?gid=729344821
- CSV exported and cached server-side for 10 minutes
- Loaded into an in-memory SQLite database (sql.js) per server instance

## Schema
Table: `attendance`
Columns: `PAX Name`, `Site Name`, `FNG`, `Post`, `Q`, `QS`, `QS-Q`, `Date`, `Month`, `Year`, `Month_1` (text, renamed from duplicate "Month"), `Day of the Week`, `City`
- PAX = participants, Q = workout leader, FNG = first-timers (0/1 flags), Post = attended (0/1)
- Sites: Grizzly Bar, Rattlesnake Ridge, Hilltop, Divento, Spartan, Trailhead, Outpost
- Locations: Granite Bay, Roseville

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS — dark theme, gradients, premium look
- **AI (chat):** `gpt-5-mini` via OpenAI Responses API with configurable reasoning effort
- **AI (suggestions):** `gpt-4o-mini` via OpenAI Chat Completions API
- **SQL engine:** sql.js (SQLite WASM, server-side only, Node.js runtime)
- **Data fetching:** TanStack React Query for home page suggestions with retry + fallback
- **Hosting:** Vercel

## AI Architecture (Agentic SQL Loop)
- CSV → in-memory SQLite DB (built once per cache cycle, reused across requests)
- Single model call (gpt-5-mini, Responses API) with `run_sql` tool
- Model calls `run_sql` as many times as needed (typically 2–5 queries per question)
- Each call: model generates SQL → executes against sql.js → results returned to model
- Model synthesizes final answer from all query results
- Streaming SSE response reports progress phases to frontend
- Follow-up suggestions generated in parallel via gpt-4o-mini (Chat Completions, no SQL needed)

## Key Design Decisions
- **Agentic SQL loop eliminates hallucination** — model only answers from exact SQL results
- **sql.js (WASM) for server-side SQLite** — works in Vercel Node.js runtime; `locateFile` points to `node_modules/sql.js/dist`
- **`outputFileTracingIncludes`** in next.config.ts ensures WASM file is included in Vercel bundle
- **No tools/function calling on suggestions** — gpt-4o-mini uses Chat Completions (not Responses API)
- **Streaming SSE** — API returns ReadableStream with phase events, then final `done` event
- **DB cached** in server memory for 10 minutes (same TTL as CSV cache)

## Streaming Protocol (SSE)
Events sent by `/api/chat`:
- `{"type":"phase","label":"Loading attendance data..."}` — progress updates
- `{"type":"done","answer":"...","suggestions":["..."]}` — final result
- `{"type":"error","message":"..."}` — error case

## Phase Labels (in order)
1. "Loading attendance data..."
2. "Preparing database..."
3. "Analyzing your question..."
4. "Querying attendance data..." (first SQL call batch)
5. "Validating results..." (second batch)
6. "Cross-checking (query N)..." (subsequent batches)

## Environment Variables
- `OPENAI_API_KEY` — OpenAI API key (never committed)
- `AUTH_SECRET` — random base64 string used to HMAC-sign the auth cookie
- `AUTH_PASSWORD` — the shared access password (currently "accelerate")
- `MCP_TOKEN` — shared bearer token for the public MCP endpoint (`/api/mcp`). If unset, the MCP endpoint stays closed (401) and the `/connect` page shows a "not enabled" notice.

## Bring Your Own Agent (MCP)
- `/api/mcp` — a remote MCP server (Streamable HTTP / JSON-RPC, no SDK) so users can connect ChatGPT, Claude, or any MCP client to the attendance data
- Auth: shared `MCP_TOKEN` via `Authorization: Bearer <token>` **or** `?key=<token>` (some connector UIs only accept a URL)
- Exposed tools (all read-only): `get_schema` (schema + F3 terminology + analytical rules), `run_sql` (single SELECT/WITH only — writes/DDL/stacked statements rejected by `isReadOnlySelect`), `search_pax` (fuzzy PAX-name lookup)
- The connecting agent does its own reasoning — the endpoint just serves data, so there is **no** OpenAI cost per external call
- Bypasses the password middleware (has its own token auth); everything else stays gated
- DB/CSV helpers shared with `/api/chat` via `lib/attendance-db.ts`
- `/connect` — login-gated instructions page with the copy-paste URL/token and per-client (Claude / ChatGPT / config-file) steps; a banner at the top of the chat UI links to it

## Cost Profile (per chat query)
- SQL queries run server-side (free)
- Model: `gpt-5-mini`, 2–5 tool calls, typically ~5–20k tokens total (no full CSV sent)
- Suggestions: `gpt-4o-mini` ~negligible
- Much cheaper than previous full-CSV approach (~$0.038/query uncached)

## Design
- Dark background (`#07070f`), gradient accents (purple `#7c3aed` / blue `#2563eb`), glassy cards
- Chat-style UI with message history and follow-up suggestion buttons
- Mobile-first: sidebar uses `min(260px, 85vw)`, "New chat" label hidden on mobile
- Phase label shown above typing indicator during AI processing
- Reasoning level dropdown in header (Low/Medium/High Reasoning)

## Authentication
- Password gate on every route via `middleware.ts` (Next.js edge middleware)
- Correct password → `POST /api/auth` → HMAC-SHA256 signed token → httpOnly cookie (`bedrock-auth`, 1-year TTL)
- Middleware verifies the HMAC on every request; bad/missing cookie redirects to `/login`
- Login page at `app/login/page.tsx` — matches app dark theme, fullscreen takeover
- Cookie is httpOnly + secure in production — not accessible to JS, can't be forged via DevTools
- To change password: update `AUTH_PASSWORD` env var and redeploy (no code change needed)

## Conversation History
- Stored in `localStorage` under key `bedrock-conversations` (array of `Conversation` objects)
- Each conversation: `{ id, title, messages, createdAt, updatedAt }`
- Title = first user message, truncated to 60 chars
- Auto-saved after every AI response
- Persistent sidebar (open by default) lists past conversations, sorted newest-first
- Desktop: sidebar is a flex column that pushes content; Mobile: fixed overlay with backdrop
- Hamburger button in header toggles sidebar; on mobile sidebar closes after selecting a conversation
- Users can restore or delete past conversations; copy button on each assistant message

## System Prompt Rules
- "Last X days" = relative to MOST RECENT date in dataset, not today
- Kotter List = PAX who posted historically but NOT in last 30 days
- Reach-out list = PAX with 60+ day gap after regular attendance
- Never list non-qualifying PAX, never narrate reasoning
- Always include specific date ranges in answers (e.g. "Jan 1 – Mar 6")
- Include counts/totals, not just names
- Never refer to "the database", "SQL", or technical details
- Off-topic questions → redirect to what Bedrock Data AI can do
- Agent validates results with follow-up queries before answering

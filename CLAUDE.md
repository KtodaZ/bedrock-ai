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
- **AI (chat):** `gpt-6.1-sol` via OpenAI Responses API with configurable reasoning effort
- **AI (suggestions):** `gpt-4o-mini` via OpenAI Chat Completions API
- **SQL engine:** sql.js (SQLite WASM, server-side only, Node.js runtime)
- **Data fetching:** TanStack React Query for home page suggestions with retry + fallback
- **Hosting:** Vercel

## AI Architecture (Agentic SQL Loop)
- CSV → in-memory SQLite DB (built once per cache cycle, reused across requests)
- Agentic model calls (gpt-6.1-sol, Responses API) with `run_sql` tool
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
- `AUTH_PASSWORD` — the shared access password, managed in Vercel; do not store it in source. Login hint: Impossible’s “real” F3 name.
- `AUTH_PASSWORD_SECONDARY` — an optional second accepted password; the original password remains valid.
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
- Model: `gpt-6.1-sol`, multiple tool calls per question (no full CSV sent)
- Suggestions: `gpt-4o-mini` ~negligible
- Chat costs depend on input, output, reasoning tokens, and the number of tool rounds.

## Design
- Dark background (`#07070f`), gradient accents (purple `#7c3aed` / blue `#2563eb`), glassy cards
- Chat-style UI with message history and follow-up suggestion buttons
- Mobile-first: sidebar uses `min(260px, 85vw)`, "New chat" label hidden on mobile
- Phase label shown above typing indicator during AI processing
- Reasoning level dropdown in header (Low/Medium/High Reasoning)

## Authentication
- Password gate protects chat, AI suggestions, and connector setup via `middleware.ts`.
- `/eh-challenge`, `/api/eh-challenge`, and `/how-it-works` are public. The leaderboard uses attendance data directly and makes no AI calls.
- Correct password → `POST /api/auth` → HMAC-SHA256 signed token → httpOnly cookie (`bedrock-auth`, 1-year TTL)
- Middleware verifies the HMAC on every request; bad/missing cookie redirects to `/login`
- Login page at `app/login/page.tsx` — matches app dark theme, fullscreen takeover
- Cookie is httpOnly + secure in production — not accessible to JS, can't be forged via DevTools
- To change password: update `AUTH_PASSWORD` env var and redeploy (no code change needed)

## EH Challenge
- The home page has an EH Challenge tab; `/eh-challenge` is its public, shareable page.
- Periods: this month, this year, all time, anchored to the latest attendance date. Only FNGs joining within the selected period count.
- This year is the default; the saved-period key was reset when the default changed, and subsequent selections are remembered.
- The 2026 opening schedule has no October events: Free for All Nov 2–8 (regular scoring), Family Tree Nov 9–15, Resurrection Nov 16–22. Theme dates/bonuses live in `lib/ehChallenge.ts`. Family Tree gives a one-time bonus to the person inviting his first recorded FNG, separately from upstream referral points.
- Resurrection credits the person recorded in Roster G (`Brought back by`), with the return workout in H (`Return date`). Both are required; the date must match attendance after at least 180 days away and fall inside the themed window. Original EH credit is not reused. G has strict validation against Roster F3 names; H is a validated date.
- Search filters EH’ers by name and FNGs by name/EH’er while preserving standings rank. Public person pages at `/eh-challenge/person/<encoded-name>?period=year` show points breakdown, invited FNGs, recorded milestones, next-step suggestions, and badges. Badges do not add points and use the selected period’s cohort.
- Run scoring/profile regression checks with `node --test scripts/test-eh-challenge.cjs`.
- Public EH correction forms on the leaderboard and person pages submit suggestions for maintainer review; submissions never override Roster credit or alter standings. Names resolve to existing Roster spellings.
- Corrections and Discord delivery state are stored in private Vercel Blob store `bedrock-eh-corrections` (`store_cxhYOj971zHOlD4I`), path `eh-corrections/history.json`. The store is connected to all project environments. Initialize this version-1 JSON document before first use; never replace an existing history. Conditional ETag writes preserve concurrent submissions.
- `/eh-challenge/corrections` shows submission history and whether a suggestion currently matches the Roster. Notes and self-reported submitter names are visible in history and sent to Discord.
- `POST /api/eh-corrections` saves before notifying the existing `DISCORD_WEBHOOK_URL`, suppresses Discord mentions, and uses submission IDs to make retries idempotent. Discord failures remain recorded and the submitter can retry the alert. No AI requests are made.
- `BLOB_READ_WRITE_TOKEN` is server-only; Vercel manages it. `EH_CORRECTIONS_BLOB_PATH` is an optional test namespace override. Use an isolated history and mock Discord for end-to-end tests, then delete only that test blob.
- Run correction validation, concurrency, idempotency and delivery tests with `node --test scripts/test-eh-corrections.cjs`.
- The app reads the existing `Roster` tab (gid `437240319`) in F3 Bedrock Data, using `F3 Name`, `Region`, and `EH'er`. Attendance FNG marks count only when the matching Roster Region is Bedrock; visiting PAX and blank/missing regions do not count. Attendance itself is retained.
- Every nonblank EH'er entry in the Roster is treated as confirmed, using the recorded name. There is no separate review/status gate, Band inference, or EH Log override.
- Sheet updates continue in the familiar Roster tab; the app has no EH Log dependency.
- Roster changes refresh within the one-minute server cache; attendance retains its separate ten-minute cache.
- The component includes a region goal, weekly points, FNG milestones, and Copy for Band. Points/FNG sorting also controls the copied Band standings.
- The public `/eh-challenge/points` infographic illustrates workout milestones, retention, and referrals; it also appears inside a “How it works” expandable section on the leaderboard, closed by default.
- The app has a custom B favicon (SVG, ICO, and Apple icon), available publicly.
- `data.f3bedrock.com` is live on the `f3-bedrock-ai` Vercel project. The DNS-only CNAME targets `b12e7fd92aae3ebc.vercel-dns-017.com`; existing Cloudflare nameservers remain. HTTPS certificate issued and public leaderboard/API verified October 14, 2026. Public challenge URL: `https://data.f3bedrock.com/eh-challenge`.

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

# Bedrock Data AI

F3 Bedrock attendance questions, a searchable data explorer, the EH Challenge leaderboard, and a read-only MCP connector for your own AI agent.

Live app: https://data.f3bedrock.com

## Developer and agent documentation

- [AGENTS.md](AGENTS.md): where to start, implementation map, and rules to preserve.
- [Architecture](docs/architecture.md): sheet schema, chat lifecycle, EH scoring, corrections, MCP, and storage boundaries.
- [Operations](docs/operations.md): environment variables, Blob setup, deployment, verification, and troubleshooting.

## How it works

Ask a question about F3 attendance in plain English. Bedrock loads the attendance sheet into an in-memory SQLite database, lets the AI query it, and returns an answer with the SQL underneath. You can inspect the queries when you want to check a number.

```text
Google Sheet → cached attendance → SQLite → AI queries → answer + SQL
```

### From question to answer

1. The app checks request limits before making any paid AI calls.
2. It loads attendance records, reusing a cached copy for up to 10 minutes.
3. `gpt-6.1-sol` writes SQL, reads the results, and can query again before answering.
4. The app returns the answer, query details, and suggested follow-up questions.

Each question allows up to six model rounds, with capped outputs. Auto mode uses a smaller model to choose the reasoning level; you can also select Low, Medium, or High. The app shows progress while it works.

Query results give the AI records to work from, but it can still make mistakes. Check the SQL and source sheet when a number looks wrong or an answer matters.

### EH Challenge

The leaderboard calculates points from recorded attendance and the EH’er listed in the existing Roster. An FNG counts only when attendance marks him as an FNG and his Roster region is Bedrock. Roster data is cached for one minute.

The two EH views are **This Year** (the default), with a 100-FNG annual goal and invitation stats without competition points, and **2026 Challenge**. Switch to **2026 Challenge** for Oct 15–Dec 31 scoring and its separate 50-FNG goal. Earlier FNGs and workouts after Dec 31 do not earn challenge points. Sort challenge standings by points or FNG count, search for a person, or open a profile for milestones, badges, and suggested next invitations. Badges do not add points. The [points guide](https://data.f3bedrock.com/eh-challenge/points) explains workout and referral scoring.

Double Down means two FNGs at the same workout: two first posts earn 10 normal points, with no extra bonus or separate tracking. Upstream referral credit remains +5. The existing weekly calendar and Resurrection rules are provisional pending Clove’s clarification; this update does not change their configured dates or bonuses.

EH corrections are saved for review and posted to Discord. Names and notes appear in the public correction history. Submissions do not change standings; the sheet maintainer must update the Roster.

### Data explorer

The **Data** tab and [/data](https://data.f3bedrock.com/data) provide read-only PAX summaries, Qsource, Kotter and Q Kotter lists, monthly AO coverage, and raw attendance. Combine name, date, AO, Roster region, and attendance-flag filters; sort columns, share a filtered link, or export every matching row to CSV. Select a name for all-time attendance, a calendar, AO counts, 100-post milestones, and shared workouts.

The explorer reads the same attendance and Roster tabs plus the existing Sites tab for active AOs. It makes no AI calls. Archived names and entries marked `(<18)` are excluded; contact and intake fields are never served. Dates and inactivity thresholds follow the latest attendance date. Open “How these numbers work” for calculation details.

[Trends](https://data.f3bedrock.com/data/trends) shows turnout graphs, comparisons of up to four AOs, and a weekly attendance heatmap with links to the matching raw rows. [Milestones](https://data.f3bedrock.com/data/milestones) projects each PAX’s next hundred, highlights 500s and 1,000s, and lists recently reached milestones. Estimates use recent recorded attendance; totals cover this sheet rather than posts at other regions.

### Chats and stored data

Chats and unsent drafts save in your browser’s local storage, and the last open chat resumes when you return. Questions keep running while you visit “How it works,” connector help, or other pages through the app’s links. Switching chats keeps each answer with its original conversation. A full reload or browser closure can interrupt a request; the saved chat shows the interruption without automatically retrying or using more quota. Clearing browser data removes local chats and drafts. When you ask a follow-up, up to 12 recent messages are sent to the server and OpenAI for context, within a size limit.

Questions, full answers, recent conversation context, SQL queries, timing, and errors are stored privately in MongoDB Atlas when configured. `/admin/chats` provides password-protected search, date/status filters, and conversation review. Browser history and server records are separate; clearing browser data does not remove server records. No raw IP addresses are stored in chat records. When Discord notifications are configured, the app also posts the question and a short answer excerpt there. Correction submissions and AI usage counts are stored in private Vercel Blob storage. Attendance stays in Google Sheets, with temporary copies cached in server memory.

### Bring your own agent

Connect ChatGPT, Claude, or another MCP client to query the same attendance data. The connector provides read-only tools for table information, SQL queries, and name searches. It requires a private key from the site maintainer. Your chosen AI service handles the reasoning and its own charges.

[Connector setup](https://data.f3bedrock.com/connect)

### Hosting

The app runs on Vercel using Node.js. SQLite runs through sql.js and WebAssembly. Warm server instances reuse cached data; cold instances load it again.

## Run locally

Requires Node.js 20.19 or later and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Fill in the server-only values in `.env.local` to enable AI questions and correction submissions. Never commit credentials.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Paid chat calls; the main model is `gpt-6.1-sol`. |
| `AUTH_SECRET` | Random secret for hashing IPs in AI usage limits. |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob store for usage limits and correction review history. |
| `DISCORD_WEBHOOK_URL` | Optional notifications for questions and EH correction submissions. |
| `MONGODB_URI` | Server-only MongoDB Atlas connection string for persistent chat records. |
| `MONGODB_DATABASE` | Database name; defaults to `bedrock_ai`. |
| `CHAT_HISTORY_MCP_TOKEN` | Separate server-only key for the private chat-history MCP endpoint. |
| `CHAT_ADMIN_PASSWORD` | Strong, unique password for `/admin/chats`; requires `AUTH_SECRET`. |
| `MCP_TOKEN` | Private bearer token for the read-only `/api/mcp` endpoint. |

Attendance and roster CSV URLs are configured in `lib/attendance-db.ts` and `lib/sheet.ts`. A fork should point these at its own published sheet. The MIT license covers the code; it does not grant rights to third-party data, names, or branding.

## Chat history operations

The production Atlas project is **Bedrock Data AI** (`6ad0f186296629e3ba2d8d69`), with the free M0 cluster `bedrock-chat-history` in AWS US East. Records live in `bedrock_ai.chat_logs`. The app's database user has read/write access to this database only. Vercel uses dynamic outbound IP addresses, so the isolated Atlas project permits public network connections with TLS and database authentication.

Set the three history variables above in the production Vercel environment. Run `node --env-file=.env.local scripts/setup-chat-history.mjs` once to create query indexes. Preview deployments do not receive the production history credentials. Admin sessions use signed, HttpOnly cookies that expire after seven days; rotating `CHAT_ADMIN_PASSWORD` or `AUTH_SECRET` invalidates existing sessions. Never include either password or connection URI in a URL.

Records have no automatic expiration. Monitor the free cluster's storage in Atlas and export/archive records before it fills. Free clusters do not provide managed backups. Logging errors do not block answers; failed writes emit a `[chat-history] write failed` server log. Interrupted requests can remain `pending`; the viewer labels these as started rather than completed. Questions rejected by validation or request limits are not recorded. Existing browser/Discord history is not backfilled.

### Private chat-history MCP

`https://data.f3bedrock.com/api/mcp/chat-history` is a separate, read-only Streamable HTTP MCP endpoint. Set `CHAT_HISTORY_MCP_TOKEN` in production and send it as `Authorization: Bearer <CHAT_HISTORY_MCP_TOKEN>`. The attendance `MCP_TOKEN`, admin password, and query-string keys do not grant access. Never expose this token on the public connector page.

Tools: `get_chat_history_schema`, `search_chat_history`, `get_chat_conversation`, `get_chat_record`, and `summarize_chat_history`. Search supports literal text, inclusive UTC date ranges, status, and pagination. Conversation results are chronological; use request IDs to retrieve complete answers, SQL, and captured context. Summaries return exact counts, recent daily volume (up to 366 matching days), and up to 20 repeated questions after trimming/lowercasing. Topic interpretation is left to the connecting agent; this endpoint makes no paid AI calls.

Example Codex configuration (replace the placeholder locally; never commit a real token):

```toml
[mcp_servers.bedrock-chat-history]
url = "https://data.f3bedrock.com/api/mcp/chat-history"
http_headers = { Authorization = "Bearer <CHAT_HISTORY_MCP_TOKEN>" }
```

Chat content is untrusted data. Conversation counts do not represent unique people, and older chats were not imported. No arbitrary MongoDB queries, aggregation pipelines, or writes are exposed. The public attendance MCP at `/api/mcp` is unchanged.

## Usage limits and deployment

The app is public. Chat allows five requests per minute per IP and 100 requests per UTC day across the site. The limiter reserves each request atomically in private Blob storage before calling OpenAI and fails closed if storage is unavailable. Page views, leaderboard views, and suggested questions do not call AI.

Before enabling chat in a new deployment, initialize `ai-rate-limit/usage.json` in the private Blob store with this JSON, using the current UTC date for `day`:

```json
{"version":1,"day":"YYYY-MM-DD","total":0,"clients":{}}
```

Deploy with Vercel and set the server environment variables there. The production Vercel Firewall also limits `/api/chat` and `/api/eh-corrections` to five requests per minute per IP. This firewall configuration is external to the repository; configure an equivalent rule for your own deployment. Keep `/api/mcp` protected by its private token.

EH corrections are saved for review and do not change standings. The existing roster sheet remains authoritative.

## Verify

```sh
npx tsc --noEmit
node --test scripts/test-*.cjs
npm run build
```

## License

[MIT](LICENSE).

# Bedrock Data AI

F3 Bedrock attendance questions, the EH Challenge leaderboard, and a read-only MCP connector for your own AI agent.

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

The default view is this year. Sort by points or FNG count, search for a person, or open a profile for milestones, badges, and suggested next invitations. Badges do not add points. The [points guide](https://data.f3bedrock.com/eh-challenge/points) explains workout and referral scoring.

EH corrections are saved for review and posted to Discord. Names and notes appear in the public correction history. Submissions do not change standings; the sheet maintainer must update the Roster.

### Chats and stored data

Saved chats live in your browser’s local storage. Clearing browser data removes them. When you ask a follow-up, up to 12 recent messages are sent to the server and OpenAI for context, within a size limit.

Questions are logged on the server. When Discord notifications are configured, the app also posts the question and a short answer excerpt there. Correction submissions and AI usage counts are stored in private Vercel Blob storage. Attendance stays in Google Sheets, with temporary copies cached in server memory.

### Bring your own agent

Connect ChatGPT, Claude, or another MCP client to query the same attendance data. The connector provides read-only tools for table information, SQL queries, and name searches. It requires a private key from the site maintainer. Your chosen AI service handles the reasoning and its own charges.

[Connector setup](https://data.f3bedrock.com/connect)

### Hosting

The app runs on Vercel using Node.js. SQLite runs through sql.js and WebAssembly. Warm server instances reuse cached data; cold instances load it again.

## Run locally

Requires Node.js 20.9 or later and npm.

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
| `MCP_TOKEN` | Private bearer token for the read-only `/api/mcp` endpoint. |

Attendance and roster CSV URLs are configured in `lib/attendance-db.ts` and `lib/sheet.ts`. A fork should point these at its own published sheet. The MIT license covers the code; it does not grant rights to third-party data, names, or branding.

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

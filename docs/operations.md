# Setup, deployment, and troubleshooting

Read [architecture.md](architecture.md) for data and scoring behavior. This guide covers the services needed to run it and the checks to use when something fails.

## Spreadsheet write permission

The F3 Bedrock Data spreadsheet is not ours; another person owns and maintains it. Treat it as someone else's working system. Preserve the maintainer's familiar tabs and workflow, keep any approved edits narrowly scoped, and avoid unsolicited cleanup, reformatting, or restructuring. Prefer adapting the app to the existing sheet over changing the sheet for the app.

Treat Google Sheets and Excel workbooks as read-only unless the user explicitly authorizes the specific edits. Before an unapproved write, present the spreadsheet, affected tabs/ranges, and proposed changes for approval. Credentials and edit access are not permission. This applies to data, formulas, formatting, validation, structure, sharing, and deletion through any tool or automation. Existing explicit approval covers only its stated scope. See [AGENTS.md](../AGENTS.md#spreadsheet-edits-require-explicit-permission).

EH correction submissions do not authorize source-sheet edits. Save them for maintainer review; never apply them automatically.

## Local setup

Use Node.js 20.19 or later and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Use the committed npm lockfile. The development server reads `.env.local`; restart it after changing credentials. Public sheet reads and leaderboard scoring do not require OpenAI. Chat requires both OpenAI configuration and working quota storage.

The source sheet URLs are constants in `lib/attendance-db.ts` and `lib/sheet.ts`. A fork must change both to use its own published CSV sources. The sheet must be readable by the server without an interactive Google sign-in; no Google OAuth or service-account integration is implemented.

## Environment variables

| Variable | Used by | Requirement |
| --- | --- | --- |
| `OPENAI_API_KEY` | Chat OpenAI client | Required for paid questions |
| `AUTH_SECRET` | HMAC of client IP in quota storage | Required for chat even though passwords were removed |
| `BLOB_READ_WRITE_TOKEN` | AI quota and correction history | Required for both durable stores; server-only |
| `DISCORD_WEBHOOK_URL` | Chat notifications and correction delivery | Optional; missing webhook leaves correction alerts pending |
| `MONGODB_URI`, `MONGODB_DATABASE` | Persistent private chat records | Server-only Atlas URI; database defaults to `bedrock_ai` |
| `CHAT_ADMIN_PASSWORD` | Private `/admin/chats` viewer | Strong unique password; sessions also require `AUTH_SECRET` |
| `CHAT_HISTORY_MCP_TOKEN` | Private chat-history MCP | Separate bearer token; production only |
| `MCP_TOKEN` | MCP POST authorization | Required only for connector access; use a private random token |
| `AI_RATE_LIMIT_BLOB_PATH` | Quota document path | Optional test namespace; default `ai-rate-limit/usage.json` |
| `EH_CORRECTIONS_BLOB_PATH` | Correction document path | Optional test namespace; default `eh-corrections/history.json` |

Set credentials locally in ignored `.env.local` and in the appropriate Vercel environment for deployment. Never use a `NEXT_PUBLIC_` name for these secrets. Production values are not included in the repository. See `.env.example` for blank names, not working credentials.

## Private Blob documents

Production uses the private store named `bedrock-eh-corrections` for both documents. The readers expect the documents to exist; they do not create them automatically.

For a **new store only**, check whether each path already exists. Create an absent document with the following initial contents. Do not overwrite an existing document, even if its date is old: the quota code handles date rollover itself.

`ai-rate-limit/usage.json` (replace the date with the current UTC date):

```json
{"version":1,"day":"YYYY-MM-DD","total":0,"clients":{}}
```

`eh-corrections/history.json`:

```json
{"version":1,"corrections":[]}
```

Use private access and stable paths without random suffixes. Runtime writes use the existing ETag with `ifMatch`; preserve that concurrency protection. The quota reader bypasses Blob cache. Do not reset counters to run tests, delete review history, or use production history for sample submissions.

## AI quota and abuse controls

Two separate layers apply:

| Layer | Configuration | Failure behavior |
| --- | --- | --- |
| Vercel Firewall | Published rule `protect-api`, regex `^/api/(chat|eh-corrections)$`, 5 requests/60 seconds per IP, fixed window | Excess requests get HTTP 429; these edge counters are regional |
| App quota | 5 questions per minute per hashed IP and 100 total per UTC day, stored in private Blob | 429 with Retry-After when full; 503 when tracking fails |

The firewall rule is project configuration outside Git. The same rule covers chat and correction paths, including their GET requests. It does not cover MCP or the correction-history subpath. Do not claim the entire site has a universal bot limiter.

The application hashes the first `x-forwarded-for` IP with `AUTH_SECRET`, then reserves quota through conditional Blob writes with up to eight conflict retries. This relies on a trusted hosting proxy supplying that header; account for it when hosting elsewhere. It uses fixed UTC minute buckets and midnight UTC daily rollover. No raw IP is saved in that quota document. Hosting/request logs are separate.

Quota counts accepted questions, not successful answers or dollars. Per-call output caps, loop limits, timeouts, and disabled SDK retries also bound paid work. They do not turn the daily question cap into an exact spending cap. MCP uses the caller's AI service and bypasses this app's AI quota; private-token access still uses hosting resources.

Inspect the external firewall without changing it:

```sh
VERCEL_PROJECT_ID=prj_exwUXEnT8WACja1Zv5IAWD67kjrc VERCEL_ORG_ID=team_U7ZBRq6ADcDAIA61U8wi9jn9 vercel firewall rules list --scope kyle-szombathys-projects
```

The live rule list was checked during this documentation update and showed `protect-api` enabled at 5/60s. Recheck it when diagnosing a future problem; Git alone cannot confirm external configuration.

## Production deployment

- GitHub: https://github.com/KtodaZ/bedrock-ai (public, MIT).
- Vercel project: `f3-bedrock-ai`, scope `kyle-szombathys-projects`.
- Public app: https://data.f3bedrock.com.
- Public challenge: https://data.f3bedrock.com/eh-challenge.
- `main` pushes trigger production deployments through the existing Git integration.
- The custom domain uses a DNS-only CNAME to `b12e7fd92aae3ebc.vercel-dns-017.com`. Cloudflare supplies the existing nameservers; the app is hosted on Vercel.

Vercel runs the Next.js server in Node.js. `next.config.ts` explicitly traces sql.js WASM files for `/api/chat`. MCP shares the loader; do not assume a successful chat bundle proves every route's bundle works. If changing runtime/bundling, exercise the affected SQL routes in the deployment.

Use `vercel ls f3-bedrock-ai --scope kyle-szombathys-projects` to find the new deployment, then `vercel inspect <deployment-url> --wait --timeout 60s --scope kyle-szombathys-projects`. Check the public domain after readiness; a local build alone does not prove production has updated. No PR or merge requirement is enforced by this guide; follow the user's current shipping instructions.

## Checks without spending AI quota

```sh
npx tsc --noEmit
node --test scripts/test-*.cjs
npm run build
```

| Test script | Coverage |
| --- | --- |
| `scripts/test-ai-rate-limit.cjs` | Per-IP/daily limits, concurrent reservations, storage failure, rejecting before OpenAI, bounded mock chat calls, free homepage suggestions |
| `scripts/test-chat-session.cjs` | Immediate saves, active-chat/draft restoration, background and parallel completion, deletion races, interrupted streams, storage failures, legacy history |
| `scripts/test-data-explorer.cjs` | Public data fields/exclusions, CSV parsing, active Sites, combined filters, PAX/Qsource counts, inactivity thresholds, streaks, shared workouts, URL filters, and safe exports |
| `scripts/test-eh-challenge.cjs` | Resurrection recipient, Family Tree versus referrals, profile milestones/badges |
| `scripts/test-eh-corrections.cjs` | Canonical names, validation, concurrent durable writes, idempotent retries, delivery failures, endpoint rejection |

These tests use mocks and synthetic records. They do not prove current sheet contents, live credential validity, or external firewall configuration. For a storage integration check, set isolated Blob paths and mock Discord; delete only those test objects afterward. Avoid running repeated live paid questions to check a UI change.

## Troubleshooting

| Symptom or question | Inspect | Likely explanation / next check |
| --- | --- | --- |
| Why are there no EH points? | Attendance FNG flag, matching Roster Region, EH'er, selected period | A visitor is not automatically a Bedrock FNG; a blank EH'er leaves workout points unassigned. Check distinct Post dates. |
| Chat FNG count differs from leaderboard | SQL query versus `lib/sheet.ts` eligibility | Chat has raw attendance without Roster region filtering; challenge uses a Bedrock cohort. |
| Sheet change has not appeared | Server CSV caches and browser challenge query | Attendance TTL is 10 minutes; Roster TTL one minute; browser staleTime five minutes. Reload/refetch after cache expiry rather than creating a new tab/source. |
| Theme or year seems wrong | Latest parsed attendance date | Periods and theme status follow `asOf`, not the wall clock. Check the source's latest valid date. |
| Resurrection has no credit | `Brought back by`, `Return date`, prior/current Post dates | Require the exact recorded return date, 180-day gap, theme window, and Bedrock region; original EH'er is insufficient. |
| Correction is saved but standings unchanged | Roster and public history | Expected until the maintainer updates the sheet. “Matches current Roster” is a comparison, not a review decision. |
| Discord alert pending | Saved notification state, webhook, delivery errors | Retry the same submission ID. No background delivery worker runs; do not delete/recreate the saved record. |
| Chat returns 429 | Firewall and durable quota | Either layer can reject. App errors include Retry-After; daily quota resets at midnight UTC. Do not clear counters to bypass it. |
| Chat returns 503 before analysis | `AUTH_SECRET`, Blob token, quota path/schema, conflict pressure | Tracking fails closed. Check the existing object instead of replacing it. |
| MCP returns 401 | Configured token and supplied header/key | MCP auth remains required even though the app is public. |
| MCP GET returns 405 | HTTP method | Expected; POST JSON-RPC to call tools. |
| Data explorer returns 503 | Attendance/Roster/Sites CSV access | The explorer needs the existing Sites tab as well as attendance and Roster. Retry after confirming all three are publicly readable; it never uses AI or writes the sheet. |
| SQL route cannot load WASM | `next.config.ts`, deployed sql.js files, Node runtime | Check the affected route's actual bundle and runtime. |
| Saved browser chat disappeared | Browser localStorage (`bedrock-conversations`, `bedrock-chat-session`) | The last open chat and per-chat drafts restore automatically. In-app links keep requests running. Reload/closure can interrupt a request; its question is preserved with a retry message. Storage failures show a warning. Browser history is separate from private MongoDB logs; clearing browser data removes the local copy. |

Questions and SQL details are logged on the server. When configured, chat also sends questions and answer excerpts to Discord. Correction history is publicly served even though its backing Blob is private. Keep these facts in privacy copy; do not describe the whole app as device-only or all stored content as private.

## Chat-history deployment checks

The MongoDB setup, indexes, and private connector are documented in [README.md](../README.md#chat-history-operations). Keep the logging helpers, admin routes, private MCP route, dependency/lockfile, and tests committed together. A deployment from local uncommitted files is temporary: the next Git-based deployment will omit them.

After deployment, run this read-only check against the public alias:

```sh
node --env-file=.env.local scripts/check-chat-history.mjs https://data.f3bedrock.com
```

It verifies authentication, all five MCP tools, MongoDB reads, and the admin route without paid AI calls, notifications, or test records. A 404 means the deployed build omitted the route; check the production commit and build route list. A 401 with the private key means its production credential differs; a storage tool error points to Atlas configuration. Preserve existing logs and quota documents when diagnosing failures. Logging failure warnings appear as `[chat-history] write failed` in runtime logs. There is no automatic expiration or historical Discord import.

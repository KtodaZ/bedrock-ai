# Bedrock Data AI

F3 Bedrock attendance questions, the EH Challenge leaderboard, and a read-only MCP connector for your own AI agent.

Live app: https://data.f3bedrock.com

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

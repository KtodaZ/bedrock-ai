# Working on Bedrock Data AI

## Read first

This is the Next.js app at https://data.f3bedrock.com. It has four separate features: attendance chat, a read-only data explorer, a deterministic EH Challenge leaderboard, and a read-only MCP connector. The leaderboard does not use AI.

Read [README.md](README.md) for the product and local setup, [docs/architecture.md](docs/architecture.md) for data flows and implementation, and [docs/operations.md](docs/operations.md) for configuration, deployment, and troubleshooting. Check the implementation before changing behavior; these docs describe the current system, not a backlog.

## Where to look

| Question or change | Start here |
| --- | --- |
| Chat UI, saved chats, menu, banner | `app/page.tsx` |
| Data tab, filters, attendance profiles | `app/DataExplorer.tsx`, `lib/dataExplorer.ts` |
| Attendance graphs, AO comparisons, heatmap | `app/AttendanceTrends.tsx`, `lib/attendanceTrends.ts` |
| Milestone forecasts and reached milestones | `app/Milestones.tsx`, `lib/milestones.ts` |
| Public data snapshot and source fields | `app/api/data/route.ts`, `lib/dataExplorerSource.ts` |
| AI model, prompts, tool loop, SSE events | `app/api/chat/route.ts` |
| AI quota and paid-call rejection | `lib/aiRateLimit.ts` |
| Attendance CSV, SQLite schema, SQL helpers | `lib/attendance-db.ts` |
| Roster, region eligibility, EH and return attributions | `lib/sheet.ts` |
| Point values, periods, themes, standings, Band text | `lib/ehChallenge.ts` |
| Leaderboard controls and infographic | `app/EhChallenge.tsx`, `app/PointsGuide.tsx` |
| Person profiles, milestones, badges | `app/PersonDetail.tsx`, `lib/ehProfile.ts` |
| Correction form, validation, public history | `app/EhCorrectionForm.tsx`, `lib/ehCorrections.ts`, `app/EhCorrectionHistory.tsx` |
| Durable correction storage and Discord delivery | `lib/ehCorrectionStore.ts` |
| MCP auth, methods, tools | `app/api/mcp/route.ts` |
| Connector instructions and public help | `app/connect/page.tsx`, `app/how-it-works/page.tsx` |
| SQLite WebAssembly deployment bundle | `next.config.ts` |

## Spreadsheet edits require explicit permission

The F3 Bedrock Data spreadsheet is not ours; another person owns and maintains it. Treat it as someone else's working system. Preserve the maintainer's familiar tabs and workflow, keep any approved edits narrowly scoped, and avoid unsolicited cleanup, reformatting, or restructuring. Prefer adapting the app to the existing sheet over changing the sheet for the app.

Never edit a spreadsheet without the user's explicit permission for the specific changes. This includes the F3 Bedrock Data Google Sheet, Excel workbooks, and any replacement or connected spreadsheet, whether accessed through a browser, connector, API, script, or automation.

- Reading, inspecting, and preparing proposed changes are allowed without write permission.
- Before any unapproved write, show the proposed changes and ask for explicit approval. Identify the spreadsheet, affected tabs/ranges, and what will change. If the user has already explicitly authorized those exact changes in the current task, proceed only within that scope.
- Writes include cell values, formulas, formatting, validation, rows/columns, tabs, sharing permissions, and deletions. Edit access, available credentials, or a general request to fix the app does not grant permission to change a spreadsheet.
- EH correction submissions remain review records; they are not permission to update the source sheet. Do not add automatic spreadsheet writes or a background process that bypasses this rule.
- If permission is missing or ambiguous, continue read-only work and leave the spreadsheet unchanged until the user approves.

## Rules to preserve

- The existing Google Sheet is authoritative. Read its attendance and Roster tabs; do not introduce an EH Log dependency or a separate source for standings.
- An FNG counts for the challenge only when attendance marks him as an FNG and his Roster `Region` is Bedrock. A visitor or first Bedrock post alone does not qualify.
- Treat a nonblank Roster `EH'er` as confirmed. Do not add approval status, Band inference, or a separate confirmation gate to existing attributions.
- Correction submissions are saved for review. They never update the sheet or standings automatically. Resolve submitted names to existing Roster spellings; keep the public-history/Discord disclosure.
- Resurrection credit goes to `Brought back by`, not the original EH'er. Require `Return date` and a matching post after a gap of at least 180 days. Family Tree credits the person inviting his first recorded FNG; upstream referral points are separate.
- Default to the year view. Periods and theme status are anchored to the latest attendance date, not the computer's calendar date. Preserve cohort scoring and the point schedule in the architecture guide.
- Badges and suggested next steps do not award points.
- Keep chat on `gpt-6.1-sol` unless the user requests a change. The user explicitly chose Sol over Astra.
- Keep paid calls behind the durable AI quota. Page loads, homepage suggestions, leaderboard views, and correction submissions must not trigger OpenAI calls. Do not replace Blob counters with process-local counters or bypass failures.
- The app is public without a password. MCP still requires its own private token. Never render real tokens on `/connect`, commit credentials, or put server secrets in client code.
- SQL-backed answers can still be wrong. Do not describe the AI as unable to hallucinate, and do not claim chat content never leaves the device.
- Keep F3 terms and concrete copy. Avoid promotional filler and unsupported accuracy claims. Preserve scoring quantities and privacy disclosures when editing wording.

## Worktrees and shipping

- Use a dedicated Git worktree and task branch for each task, starting from the latest `origin/main`. Preserve unrelated changes and other agents' worktrees.
- After completing the task and passing the appropriate checks, commit only the task's changes, push the task branch, merge it into the latest `main`, and push `main`. Do this without asking for another confirmation unless the user explicitly requests otherwise.
- Resolve conflicts within the task's scope; never overwrite unrelated work or force-push `main`. If a blocker prevents shipping, report it clearly.
- Pushing `main` triggers Vercel production. Verify the resulting deployment and affected published behavior before reporting it as live.
- Remove the task's worktree after shipping, preserving source and review media needed for the handoff.

## Working and verification

Use npm and the committed `package-lock.json`. Install with `npm ci`; copy `.env.example` to ignored `.env.local` and fill in your own credentials. See the operations guide before creating Blob documents. Never replace existing production counters or correction history with empty test data.

For implementation changes, run the checks appropriate to the affected behavior:

```sh
npx tsc --noEmit
node --test scripts/test-*.cjs
npm run build
```

The test scripts mock external services. Do not submit test corrections to production, send Discord test messages, or spend AI quota for routine checks. For storage integration tests, use isolated Blob paths and mock notifications. Documentation-only changes need link/source review rather than paid calls or a full rebuild.

Inspect the working tree before editing and preserve unrelated changes. Keep source and review screenshots; remove only your own disposable files. For UI changes, inspect the actual updated page and include screenshots in the handoff. Prefer T3 preview tools when available.

`main` is connected to Vercel production: pushing commits there starts a production deployment. Keep deployment claims separate from local checks and verify the published change when shipping. Credentials and a logged-in CLI do not authorize unrelated infrastructure or data changes.

Keep this file as the agent entry point. Update the linked guides alongside changes to scoring, data columns, endpoints, limits, storage, or deployment. Do not recreate a competing CLAUDE.md.

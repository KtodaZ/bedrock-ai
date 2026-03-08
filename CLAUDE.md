# Bedrock AI — Project Context

## What This Is
A Q&A chat UI for F3 workout group attendance data. Users ask natural language questions, AI answers by analyzing a Google Sheet directly. No separate database.

## Data Source
- Google Sheet (public): https://docs.google.com/spreadsheets/d/11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0/edit?gid=729344821
- CSV export fetched directly at query time, cached server-side for 10 minutes
- ~1,500+ rows, ~152k tokens when sent to the model
- ~6 months of data is the effective window for most queries

## Schema
Columns: `PAX Name`, `Site Name`, `FNG`, `Post`, `Q`, `QS`, `QS-Q`, `Date`, `Month`, `Year`, `Month` (text), `Day of the Week`, `City`
- PAX = participants, Q = workout leader, FNG = first-timers (0/1 flags)
- Sites: Grizzly Bar, Rattlesnake Ridge, Hilltop, Divento, Spartan, Trailhead, Outpost
- Locations: Granite Bay, Roseville

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS — dark theme, gradients, premium look
- **AI (chat):** `gpt-5-mini` via OpenAI Responses API with configurable reasoning effort
- **AI (suggestions):** `gpt-4o-mini` via OpenAI Chat Completions API
- **Data fetching:** TanStack React Query for suggestions with retry + fallback
- **Hosting:** Vercel

## AI Approach
- Full CSV sent to model on every chat query (no SQL, no ETL)
- Reasoning effort selectable by user: low / medium / high (default: low)
- Follow-up suggestions generated in parallel via `gpt-4o-mini` (Chat Completions, no CSV needed)
- Home page suggestions via `gpt-4o-mini`, CDN-cached 24hr (`s-maxage=86400`)

## Key Design Decisions
- **No tools/function calling on main chat route** — Responses API reasoning models skip text output when a function call fires. Suggestions are generated as a separate parallel call instead.
- **gpt-4o-mini uses Chat Completions, not Responses API** — Responses API is for reasoning models only
- **Do not use `tool_choice: "required"`** with reasoning models on the Responses API — it produces only a function_call with no text message

## Environment Variables
- `OPENAI_API_KEY` in `.env.local` (never committed)

## Cost Profile (per chat query)
- Input: ~152k tokens (full CSV)
- Model: `gpt-5-mini` ~$0.038/query uncached
- Suggestions: `gpt-4o-mini` ~negligible (no CSV)
- Biggest lever: reasoning level — low is ~5–10x cheaper than high in reasoning tokens

## Design
- Dark background (`#07070f`), gradient accents (purple `#7c3aed` / blue `#2563eb`), glassy cards
- Chat-style UI with message history and follow-up suggestion buttons
- Mobile-first: sidebar uses `min(260px, 85vw)`, "New chat" label hidden on mobile
- Reasoning level dropdown in header (Low/Medium/High Reasoning)

## Conversation History
- Stored in `localStorage` under key `bedrock-conversations` (array of `Conversation` objects)
- Each conversation: `{ id, title, messages, createdAt, updatedAt }`
- Title = first user message, truncated to 60 chars
- Auto-saved after every AI response
- Slide-in sidebar (hamburger in header) lists past conversations, sorted newest-first
- Users can restore or delete past conversations

## System Prompt Rules
- "Last X days" = relative to MOST RECENT date in dataset, not today
- Kotter List = PAX who posted historically but NOT in last 30 days
- Reach-out list = PAX with 60+ day gap after regular attendance
- Never list non-qualifying PAX, never narrate reasoning
- Always include specific date ranges in answers (e.g. "Jan 1 – Mar 6")
- Include counts/totals, not just names
- Never refer to "the CSV", "the data", or "the spreadsheet"

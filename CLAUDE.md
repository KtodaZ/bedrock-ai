# Bedrock AI — Project Context

## What This Is
A Q&A chat UI for F3 workout group attendance data. Users ask natural language questions, AI answers by querying a Google Sheet directly. No separate database.

## Data Source
- Google Sheet (public): https://docs.google.com/spreadsheets/d/11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0/edit?gid=729344821
- CSV export fetched directly at query time, cached server-side for 10 minutes
- ~1,500+ rows of structured F3 attendance data

## Schema
Columns: `PAX Name`, `Site Name`, `FNG`, `Post`, `Q`, `QS`, `QS-Q`, `Date`, `Month`, `Year`, `Month` (text), `Day of the Week`, `City`
- PAX = participants, Q = workout leader, FNG = first-timers (0/1 flags)
- Sites: Grizzly Bar, Rattlesnake Ridge, Hilltop, Divento, Spartan, Trailhead, Outpost
- Locations: Granite Bay, Roseville

## Tech Stack
- **Framework:** Next.js (App Router, TypeScript)
- **Styling:** Tailwind CSS — dark theme, gradients, premium look
- **AI:** GPT-5.4 (`gpt-5.4`) via OpenAI API
- **Query engine:** sql.js (SQLite in-memory in Node)
- **Hosting:** Vercel

## AI Approach (Hybrid)
1. Fetch & cache CSV (10-min server-side cache)
2. **Default:** Schema + question → GPT-5.4 generates SQL → run in sql.js → result + question → GPT-5.4 plain-English answer
3. **Fallback:** If SQL fails or question is fuzzy, send full CSV (~28k tokens) to GPT-5.4

## Environment Variables
- `OPENAI_API_KEY` in `.env.local` (never committed)

## Example Questions
- "Who is showing up to Hilltop site the most in the last 30 days?"
- "Who needs a shout out to come visit?" (PAX who haven't posted recently)

## Design
- Dark background, gradient accents (purple/blue), glassy cards
- Chat-style UI with message history
- Should look premium / "sick"
- Mobile-first: sidebar badge and "New chat" label hidden on small screens, sidebar uses `min(288px, 85vw)`

## Conversation History
- Stored in `localStorage` under key `bedrock-conversations` (array of `Conversation` objects)
- Each conversation: `{ id, title, messages, createdAt, updatedAt }`
- Title = first user message, truncated to 60 chars
- Auto-saved after every AI response
- Slide-in sidebar (hamburger in header) lists past conversations, sorted newest-first
- Users can restore or delete past conversations
- "New chat" button in header (icon only on mobile) and sidebar

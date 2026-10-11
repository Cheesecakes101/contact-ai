# Contact AI

An AI-powered personal contacts app. Add someone, talk for 30 seconds about how you know them, and Claude turns it into a profile you can search in plain English later.

## Core loop

1. **Add a person** (`/add`)
   - Import from your phone: the Contact Picker on Android Chrome, or a `.vcf` file anywhere (on iPhone, Contacts → Share Contact). Pick one contact to pre-fill the form, or pick many to bulk-import.
   - Add context with a **guided voice note**. It asks one question at a time (where/how you met, what they do, interests, how you could help each other, follow-ups) and transcribes live. You can also type.
2. **AI structures the context.** It pulls out where/how you met, what they do, interests, ways to collaborate, tags, a suggested relationship category and any follow-up mentioned. You can edit everything before saving.
3. **Relationship category**: Close friend · Friend · Acquaintance · Professional.
4. **Natural-language search** (`/search`): “Who do I know in venture capital?”, “Who did I meet at Night School?”, “Who can help me with jewellery?” Results come back with a reason for each match. Without an API key it falls back to keyword search.
5. **Contact profile**: context, interaction history, last interaction and notes. **Log a catch-up** by voice or text. The interaction is logged and new facts are merged into the profile.
6. **Follow-ups**
   - “Remind me in 7/30/90 days” or pick a date. Reminders show on the home screen with done/snooze.
   - **Time to reconnect** suggestions are based on how long it has been, measured against each category's cadence (close friend 21 days, friend 45, professional 90, acquaintance 120).
   - **Reconnect draft**: AI writes a short message you can send, grounded in what you know about the person.
7. **Light web enrichment.** An optional public web search fills in LinkedIn, company, role, location and mentions, with sources. Everything from it is shown in a separate card marked **⚠ AI-estimated · unverified**, with a confidence level. Actions: “Looks right — use role & company” and “Wrong person — remove”. Web data never overwrites what you entered yourself.

## Contact Drop (`/drop`)

Frictionless sharing: swap contacts with everyone in the room.

1. **Create a Room**: the host gets a random 6-character code, a link and a QR code to show on screen.
2. **Attendees Add Info**: name, phone, email, profession and optional links. No account needed. Attendees can edit their card while the room is open.
3. **Export and Import**: when the host closes the room, everyone can download one `contacts.vcf`, and iOS/Android will offer to import all of the cards. The host can also **Save all to my Contact AI**, which tags each person with “Met at <event>”.

Attendees can only see the other cards once the room is closed. Only the host (who holds a token stored in their browser) can close it.

## Running it

Requires Node 22.5+ (it uses the built-in `node:sqlite`, so there are no native deps).

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

| Env var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the AI features: structuring, smart search, web enrichment and reconnect drafts. The app still works without it. |
| `ANTHROPIC_MODEL` | Optional model override (default `claude-opus-5-5`). |
| `APP_PASSCODE` | Optional. Locks your private contacts behind a passcode. Contact Drop rooms stay public. |
| `DATABASE_PATH` | Optional. SQLite file location (default `data/contacts.db`). |

Voice capture uses the browser's Web Speech API (Chrome, Edge and Safari, including iOS). In other browsers the text box still works, and the keyboard's dictation mic is a good fallback.

**Deploying:** data is kept in a local SQLite file, so deploy to a host with a persistent disk (Railway, Fly.io, Render, a VPS). Serverless hosts with ephemeral filesystems like Vercel would lose data. Set `APP_PASSCODE` on any public deployment.

## Code map

- `src/lib/ai.ts`: every Claude call (structured outputs via Zod, web search tool, server-side refusal fallback)
- `src/lib/db.ts`: SQLite schema and queries
- `src/lib/vcard.ts`: vCard read/write
- `src/lib/followups.ts`: due reminders and reconnect suggestions
- `src/components/VoiceCapture.tsx`: guided voice note
- `src/app/**`: pages and API routes (Next.js App Router)

# TobyVerse

Next.js 15 app (App Router, TypeScript, Tailwind CSS 3.4) with Firebase Auth/Firestore and Anthropic Claude for text generation. Gemini is used only for photo understanding and saved-material embeddings; it is not selectable as a chat model.

## Setup

```bash
cd Tobyverse
copy .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Fill `.env.local` with your Firebase web app keys, `ANTHROPIC_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY` (Gemini photo understanding and saved-material embeddings). Current weather answers use Claude's built-in web search and require no separate weather API key.

## Run

```bash
npm run dev
```

Starts the Next.js app at [http://localhost:3000](http://localhost:3000).

```bash
npm run build && npm start
```

Production build, then `next start` on port 3000.

## Parallel Vite and background-job preview

The existing Next app remains the default. To run the parallel migration slice, use Node.js 22.16 or newer and keep the existing Firebase web keys in the repository-root `.env.local`. Large job inputs/results also require `FIREBASE_STORAGE_BUCKET` or the existing `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` value so the backend can select the Storage bucket explicitly:

```bash
npm run dev:stack
```

This starts the Vite preview at [http://localhost:5173](http://localhost:5173) and the Express API plus durable job worker on port 4000. The worker uses the repository's existing Firebase Admin credentials. The Next app can continue running separately with `npm run dev` on port 3000.

The first SPA slice includes authenticated chat generation jobs. Jobs continue after closing the Vite tab, can be restored from the active-job list, and expose saved status/events/results. Only chat jobs are enabled so far; other existing routes still run from Next and have not moved to the SPA. The new chat handler temporarily reuses the existing `/api/chat` source to preserve its current prompts, tools, retrieval, and budget logic.

```bash
npm run build:stack
npm run jobs:inspect
```

`build:stack` builds the Vite and backend workspaces without changing the Next scripts. `jobs:inspect` uses Firebase Admin credentials to list recent queued, running, failed, and stuck jobs with sanitized metadata only.

## Hosting

Classic Firebase Hosting is a CDN. It cannot execute this Next.js app (API routes, App Router, no `output: "export"`). The working path is the Firebase web-frameworks adapter: `hosting.source` is this repo, and `firebase deploy --only auth,hosting` applies Google sign-in configuration, builds Next, and updates Cloud Function / Cloud Run `ssrtobyverse` (us-central1) plus the `tobyverse` Hosting site on project `ugstuff-c351a`. Do not rewrite Hosting to the old `ssrugstuffc351a` service — that leaves `/project/[id]` and other dynamic routes on a stale build while `/new` looks current.

One-time (if `webframeworks` is off):

```bash
firebase experiments:enable webframeworks
```

Publish this repo’s current UI:

```bash
npm run build
firebase deploy --only auth,hosting
```

Or `npm run deploy` (builds, then deploys Auth and Hosting). Live URL: [https://tobyverse.web.app](https://tobyverse.web.app). Requires the Firebase CLI and `firebase login`. Does not deploy Cloud Functions as a separate product; the Next server is the frameworks Cloud Run service.

Do not set `hosting.public` to `public/`. That only uploads favicons and static files from `public/`; `/account` and the app shell keep coming from the last Cloud Run revision.

Env vars the host must have:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `ANTHROPIC_API_KEY` (required for Claude Haiku and Sonnet)
- Optional rollback switches: `ANTHROPIC_PROMPT_CACHE=0` disables Claude prefix/history caching; `CHAT_CONTEXT_COMPACTION=0` disables thread summaries and older-message retrieval. Both optimizations are enabled by default. Cache read/write counts appear in `[ai-cache]` diagnostics without prompt text; plan usage uses their actual discounted rates. Occasional background summaries are metered separately and never run on every message.
- `FIREBASE_SERVICE_ACCOUNT_JSON`

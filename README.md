# TobyVerse

Next.js 15 app (App Router, TypeScript, Tailwind CSS 3.4) with Firebase Auth/Firestore and Gemini.

## Setup

```bash
cd Tobyverse
copy .env.local.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Fill `.env.local` with your Firebase web app keys and `GOOGLE_GENERATIVE_AI_API_KEY`.

## Run

```bash
npm run dev
```

Starts the Next.js app at [http://localhost:3000](http://localhost:3000).

```bash
npm run build && npm start
```

Production build, then `next start` on port 3000.

## Hosting

Classic Firebase Hosting is a CDN. It cannot execute this Next.js app (API routes, App Router, no `output: "export"`). The working path is the Firebase web-frameworks adapter: `hosting.source` is this repo, and `firebase deploy --only hosting` builds Next and updates Cloud Function / Cloud Run `ssrtobyverse` (us-central1) plus the `tobyverse` Hosting site on project `ugstuff-c351a`. Do not rewrite Hosting to the old `ssrugstuffc351a` service — that leaves `/project/[id]` and other dynamic routes on a stale build while `/new` looks current.

One-time (if `webframeworks` is off):

```bash
firebase experiments:enable webframeworks
```

Publish this repo’s current UI:

```bash
npm run build
firebase deploy --only hosting
```

Or `npm run deploy` (enables the experiment, builds, then deploys hosting). Live URL: [https://tobyverse.web.app](https://tobyverse.web.app). Requires the Firebase CLI and `firebase login`. Does not deploy Cloud Functions as a separate product; the Next server is the frameworks Cloud Run service.

Do not set `hosting.public` to `public/`. That only uploads favicons and static files from `public/`; `/account` and the app shell keep coming from the last Cloud Run revision.

Env vars the host must have:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

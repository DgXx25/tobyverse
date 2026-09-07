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

```bash
npm run deploy
```

Runs `npm run build`, then `firebase deploy --only hosting` to [https://tobyverse.web.app](https://tobyverse.web.app). Requires the Firebase CLI (`npm i -g firebase-tools`) and `firebase login`. Does not deploy Cloud Functions.

You can also deploy on [Vercel](https://vercel.com). Copy the same env vars from `.env.local` into the host.

Env vars the host must have:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON`

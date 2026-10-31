# Tutorial OS (TOS)

A multi-tenant platform for tutorial centres in Nigeria: each centre gets its
own dashboard, students, tutors, programmes, payments, admissions, a question
bank, and scheduled mock exams with 6:00 a.m. (Lagos) result releases.

## Stack

- React 19 + TypeScript + Vite + Tailwind (the PWA front end)
- Express (server.ts) wrapped by a Netlify Function (netlify/functions/api.mts)
- Firebase: Auth + Firestore (secondary database) + Cloud Functions
  (mock-release.mts runs the daily mock release cron)
- Cloudinary (published question-bank files)
- Netlify (hosting; the `netlify-preview-setup` branch deploys to
  deploy-preview-1--tutorialos.netlify.app)

## Repo layout

    server.ts                  Express app: AI routes, internal doors, helpers
    netlify/functions/         api.mts (server entry) and the release cron
    src/                       React app (admin, tutor and student portals)
    firestore.rules            Firestore security rules (see "Security")
    firestore.indexes.json     composite indexes (deploy before first mock)
    scripts/                   one-off and maintenance scripts (server-side)
    tests/rules/               Firestore rules tests (run on the emulator)

## Development

    npm install
    npm run dev        # Vite dev server
    npm run build      # type-check + production build

Env vars are documented in `.env.example`. Everything that varies by centre
or by plan (prices, caps, feature flags) lives in Firestore, never in code.

## Rules tests

The security rules are tested locally against the Firestore emulator
(Java 21 required):

    npx firebase emulators:exec --only firestore --project demo-tos-rules \
      "node tests/rules/dirtyDozen.rules.test.mjs"   # 29 attack-payload checks
    npx firebase emulators:exec --only firestore --project demo-tos-rules \
      "node tests/rules/mocks.rules.test.mjs"        # 81 mock deny-block checks
    npx firebase emulators:exec --only firestore --project demo-tos-rules \
      "node tests/rules/centreSettings.rules.test.mjs"

## Security notes

- All security checks are enforced server-side or by Firestore rules; client
  UI checks are convenience only.
- No demo or hard-coded credentials anywhere; provisioning generates
  one-time passwords.
- The Firebase web config in the bundle is public by design; secrets live in
  Netlify env vars and are never in the repo.
- AI/Gemini routes are signed-in-only, per-user rate-limited and body-capped.
- Rule or data changes are tested in the emulator first; publishing rules is
  a deliberate, human-approved action in the Firebase console.

See docs/app-check.md for the recommended Firebase App Check rollout.

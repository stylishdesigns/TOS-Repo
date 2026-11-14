# Firebase App Check for Tutorial OS (documentation only)

App Check verifies that requests to Firebase come from your real app, not from
scripts curling the public web API key. This repo deliberately does not enable
it in code yet; this note is the rollout plan for when you choose to.

## What it protects

App Check only guards Firebase-managed surfaces (Firestore, Storage, Auth
abuse, Cloud Functions callable endpoints). It does not protect the Express
API on Netlify, which already enforces same-origin checks, sign-in gates,
per-user rate limits and body caps.

## Rollout (when you decide to)

1. Firebase console -> App Check -> Apps -> register the web app with
   reCAPTCHA v3 (or reCAPTCHA Enterprise) and store the site key.
2. Add the key as a Netlify env var (e.g. RECAPTCHA_V3_SITE_KEY) and wire it
   into `src/firebase.ts` initialiseApp({ appCheck }). That is a code change,
   so it should be its own reviewed piece.
3. Start every service in "Monitor" (non-blocking) mode and watch the metrics
   for a week: legit traffic shows up as verified, old cached clients as
   unverified.
4. Only flip Firestore/Storage to "Enforce" once the unverified share is
   near zero, because enforcement rejects every client that has not loaded
   the updated bundle yet (including phone-cached PWAs).

## Cost

reCAPTCHA v3 is free. reCAPTCHA Enterprise has its own pricing; v3 is enough
here. No Firestore reads or writes are added by App Check itself.

# Hardening report (Prompt A, Step 0)

Where each defect occurs in the code as of commit 5aeebc6 (branch netlify-preview-setup).
Line numbers refer to that commit and will shift as fixes land.

## Fix status (Prompt A landed)

All eight defects are addressed on this branch (commits 146be6d, 19b8c15, a825c1a,
dc75297, 4a43315, d19ab68, c749073). Status as of c749073:

1. Auth bypass — fixed. `getCaller` no longer decodes token payloads; every `/api`
   route except `/api/health`, `/api/public/*` and `/api/internal/*`
   (`x-internal-secret`) requires a verified ID token.
2. Silent fake data — fixed. `MEMORY_STORE` removed; tenantService is Firestore-only
   and failures raise via `dbFailure` (500, no silent success). No empty catches
   remain in `tenantService.ts` or `server.ts`.
3. Unauthenticated endpoints — fixed. `/api/centre/entitlements` and
   `/api/centre/seats-summary` require an active member (or admin/owner) of the
   centre, with centreId resolved from the verified caller, not the client.
4. Seat checks — fixed. `joinCentreService`, `activateStudentService` and
   `toggleStudentAccessService` are transactional and maintain
   `activeStudentCount` (409 `CENTRE_FULL` under concurrency).
5. Hard-coded values — fixed server-side. Plan prices/caps live in `platformPlans`,
   config in `platformConfig/global`, seeded create-if-missing by
   `scripts/seed-platform-plans.ts`; missing docs return 500 pointing at the seed
   script. Client-side super-admin refs in `AppContext.tsx` remain for Prompt B.
6. Independent-tutor leftovers — fixed in `src/types.ts`, `tenantService.ts`,
   `seed-platform-plans.ts`, `firebase-blueprint.json` and
   `docs/tenant-migration-plan.md`. The unrelated comment at
   `CbtTab.tsx:267` is untouched.
7. Rate limiting — fixed. Firestore `rateLimits/{key}` (5 attempts per 15-min
   window, growing lockout capped at 24h, `expiresAt` TTL field needs a console TTL
   policy) plus per-user per-route `consumeAiRateLimit` from
   `platformConfig.global.aiRouteRateLimitPerHour`.
8. AI routes — fixed via middleware only (`aiQuestionsGate`/`aiEssayGate`), handlers
   untouched; clients attach tokens through `src/utils/serverApi.ts` on same-origin
   `/api` calls.

Backward compatibility: centres with no billing document keep their own stored
status verbatim (`effectiveStatus`), email-keyed legacy memberships still resolve,
access codes stay server-generated 6-digit with the uniform error message, and
`/api/health` stays public for Cloud Run checks.

Verified on this branch: `tsc --noEmit` clean, `npm run build` passes, and
`scripts/test-auth-401.ts` reports all token cases behaving correctly (missing,
forged, expired -> 401; health stays public).

Still manual (needs the service-account JSON in your environment):
run `scripts/seed-platform-plans.ts` once, then `scripts/grant-tos.ts` for the
super-admin email and clear `TOS_BOOTSTRAP_EMAILS`; set a TTL policy on
`rateLimits/expiresAt` in the Firebase console.

## 1. Auth bypass (unsigned token decode)
- `server.ts` `getCaller` (around line 330-351): on `verifyIdToken` failure the handler
  splits the JWT and decodes the payload with `Buffer.from(parts[1], 'base64')` without
  any signature check, then trusts `uid`/`email` from it. Anyone can forge a token.
- `/api/session/sync` is safe (it uses `verifyIdToken` directly), every other route goes
  through `getCaller`, so every route except session/sync is affected.

## 2. Silent fake data
- `src/server/tenantService.ts`: `MEMORY_STORE` (lines ~66-183) holds a demo centre
  (`centre-excellence`), access code `123456`, a membership for the hard-coded
  super-admin email, hard-coded plans (including `independent`) and config values
  (trial 30 days, skip-trial discount 15, grace 7).
- 18 empty `catch (e) {}` blocks wrap Firestore reads/writes in tenantService.ts
  (lines 244, 283, 341, 359, 438, 447, 494, 515, 588, 619, 671, 702, 721, 760, 772,
  782, 801, 867) and one in server.ts (line 349, part of defect 1). When Firestore
  fails the server silently serves or writes nothing and still reports success.

## 3. Unauthenticated endpoints
- `server.ts` `/api/centre/entitlements` and `/api/centre/seats-summary`: no
  `getCaller` call, `centreId` taken from `req.query.centreId` or the
  `x-centre-id` header. Anyone with a centre id can read its plan features and
  full seat roster (student uids and access states).

## 4. Seat checks are not transactional
- `tenantService.ts` `joinCentreService` (~line 470): count-then-write; two concurrent
  joins can both pass the cap check.
- `activateStudentService` (~line 596) and `toggleStudentAccessService`
  (~line 640, enable branch): same pattern.

## 5. Hard-coded values
- Super-admin email `stylishdesigns484@gmail.com`: tenantService.ts lines 88, 119-121,
  212, 333, 395, 861; server.ts session sync (`isTosEmail`); client-side (UI-only,
  left for Prompt B) `src/context/AppContext.tsx` lines 906 and 1603.
- Plan prices/caps/flags: `MEMORY_STORE.plans` (tenantService.ts lines 127-177).
- Platform config numbers: `MEMORY_STORE.config` (trialDays 30, skipTrialDiscountPct 15,
  trialGraceDays 7, lines 178-182).
- Seat swap limit: hard-coded `2` in `toggleStudentAccessService` line 727
  (`MEMORY_STORE.config.trialGraceDays ? 2 : 2`).
- Rate limiter constants (5 attempts / 15 min) are in-process constants; acceptable as
  security defaults, but the counter itself moves to Firestore (defect 7).

## 6. Independent-tutor leftovers
- `src/types.ts:439` `CentreAccountType = 'centre' | 'independent'`; line 469 and 498
  mention `'independent'` in plan id unions; `Centre.type` (line 458);
  `CentreUserRole.type` (line 551).
- `src/server/tenantService.ts:130-146` the `independent` plan in MEMORY_STORE;
  lines 533-538 `autoApproveStudents` default tied to `type === 'independent'`.
- `scripts/seed-platform-plans.ts:6-30` seeds the `independent` plan.
- `firebase-blueprint.json` lines 165, 170, 219, 259: independent enum/text.
- `docs/tenant-migration-plan.md` lines 4, 41: independent tutor text.
- `src/components/tutor-portal/tabs/MoreTab.tsx:99` renders `centre.type` (UI label).
- `src/components/student-portal/tabs/CbtTab.tsx:267` uses the English word
  "independent" in a comment about a weekly filter; unrelated to tutor accounts, left as is.

## 7. In-process rate limiting
- `tenantService.ts` lines 14-63: `rateLimitMap = new Map()`; per-instance only, so
  Cloud Run with more than one instance loses counts. Lockouts also vanish on deploy.

## 8. AI routes are open
- `server.ts` `/api/generate-questions` and `/api/grade-essay` have no auth check;
  client calls at `src/components/tutor-portal/tabs/AssessmentTab.tsx:443`,
  `src/components/academics/CBTManager.tsx:515` and `src/utils/essayGrading.ts:352`
  send no Authorization header today.

## Other findings of the same kind
- `getCentreEntitlements` silently defaults a centre with no billing document to
  `centre_standard` features (fail-open); kept as an identifier default but now it
  reads real plan data only.
- `enterCentreService`/`joinCentreService` fall back to `MEMORY_STORE` centre data when
  Firestore is down, which is how a wrong centre id could still be "found".
- `verifyAdminOrOwner` trusts the email claim from an (possibly forged) token.
- `server.ts` `/api/health` is intentionally left unauthenticated (Cloud Run health check).

## Notes for Prompt B (out of scope here)
- `firestore.rules` is still the old single-tenant file.
- `AppContext.tsx` still has 22 whole-collection `onSnapshot` listeners, none scoped by
  `centreId`, and four `activeCentreId || 'centre-excellence'` fallbacks (lines 1292,
  1322, 1758, 1860).

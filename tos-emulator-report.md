# Firestore Rules: Emulator Test Report (Prompt G2, centre-scoped rules)

Prepared by Fo (Wajo) for independent review. Run date: Tuesday, 27 October 2026.

## What this report covers

- The production Firestore rules file (`firestore.rules`, 431 lines) as published live on 27 Oct 2026. The live ruleset was read back from Firebase and matches the repo file exactly (ruleset `a0a4eb54-0acb-4214-8d84-f61e36737fe7` on database `ai-studio-excellencetutori-8f17639e-56a5-4f6b-8031-016b3f70cf68`).
- The changes being verified (commit `66a3d21` on branch `netlify-preview-setup`): centre-scoped rules, aka Prompt G2.
- Two test suites run against the local Firestore emulator with the real rules file: `tests/rules/dirtyDozen.rules.test.mjs` (44 checks, pre-existing security suite) and `tests/rules/centreScope.rules.test.mjs` (37 checks, new suite written for G2).

## Headline

**81 of 81 checks passed (44 + 37), zero failures, on the exact rules file that is live in production.**

## The G2 semantics under test

1. `isAdminOfCentre(c)`: an admins record now only grants power inside its own `centreId`. Platform staff (users with the `tos` custom claim) act across all centres.
2. Fail-closed: an admins record with no `centreId` acts for no centre; any record without a `centreId` (legacy data) is unreachable by centre admins until it is tagged.
3. Records can never be moved between centres: updates require `centreId` to stay unchanged (`centreTagUnchanged()`).
4. Scoping applied to: students (get/list/create/update/delete), payment admin reads, tutors (create/update/delete), admissions, attendance_logs, results (admins and tutors), activities.
5. Backfill verified live on 27 Oct 2026: all 19 tenant collections fully tagged (72 docs scanned, 0 untagged), so publishing hides no legacy data.

## Suite 1: dirty dozen (44/44 passed)

**Group 1a**

- PASS: 1a. unauth write settings/global denied

**Group 1b**

- PASS: 1b. unauth read settings/global allowed (public website data)

**Group 2a**

- PASS: 2a. student A get student B denied

**Group 2b**

- PASS: 2b. student A get own record allowed

**Group 3a**

- PASS: 3a. student create own admins record denied

**Group 3b**

- PASS: 3b. student read other admins record denied

**Group 3c**

- PASS: 3c. admin write staff record allowed

**Group 4a**

- PASS: 4a. student change own totalFee denied

**Group 4b**

- PASS: 4b. student change own paymentStatus denied

**Group 4c**

- PASS: 4c. student change own status denied

**Group 4d**

- PASS: 4d. student edit own profile fields allowed

**Group 4e**

- PASS: 4e. student change own paidAmount denied

**Group 4f**

- PASS: 4f. student change own outstandingBalance denied

**Group 5a**

- PASS: 5a. admin create student with fake programme denied

**Group 5b**

- PASS: 5b. admin create student with real programme allowed

**Group 6a**

- PASS: 6a. unauth create payment denied

**Group 6b**

- PASS: 6b. student A pay for student B denied

**Group 6e**

- PASS: 6e. student create payment via own admin-created record denied

**Group 6c**

- PASS: 6c. student create own payment denied (server route only)

**Group 6d**

- PASS: 6d. admin client create payment denied (server route only)

**Group 6f**

- PASS: 6f. student create own Pending claim directly denied

**Group 6g**

- PASS: 6g. student mark own Pending payment as Paid denied

**Group 6h**

- PASS: 6h. student edit own payment amount denied

**Group 6i**

- PASS: 6i. student delete own payment denied

**Group 6j**

- PASS: 6j. admin client update payment denied (confirm route only)

**Group 6k**

- PASS: 6k. admin client delete payment denied

**Group 13a**

- PASS: 13a. unauth read payment denied

**Group 13b**

- PASS: 13b. student reads own payment (studentId = own uid) allowed

**Group 13c**

- PASS: 13c. student reads own payment via own admin-created record allowed

**Group 13d**

- PASS: 13d. student reads another student payment denied

**Group 13e**

- PASS: 13e. student centre-wide payments list denied

**Group 13f**

- PASS: 13f. student own-payments query allowed

**Group 13g**

- PASS: 13g. admin reads own-centre payment allowed

**Group 7a**

- PASS: 7a. tutor change own status denied

**Group 7b**

- PASS: 7b. tutor edit own profile (status unchanged) allowed

**Group 7c**

- PASS: 7c. invited tutor first-login acceptance allowed

**Group 8a**

- PASS: 8a. admin create student with 200-char id denied

**Group 9a**

- PASS: 9a. student self-create with future createdAt denied

**Group 9b**

- PASS: 9b. student self-create without createdAt allowed

**Group 10a**

- PASS: 10a. unauth delete settings/global denied

**Group 11a**

- PASS: 11a. student list all students denied

**Group 12a**

- PASS: 12a. visitor create Approved admission denied

**Group 12b**

- PASS: 12b. visitor create Pending admission allowed

**Group 12c**

- PASS: 12c. visitor update admission status denied

## Suite 2: centre isolation (37/37 passed)

**Group A - The original hole: cross-centre student access (the exact attack Claude described: centre A admin editing centre B's student, paidAmount included)**

- PASS: A1. centre A admin gets centre B student denied
- PASS: A2. centre A admin changes centre B student fee denied
- PASS: A3. centre A admin updates centre B student name denied
- PASS: A4. centre A admin deletes centre B student denied
- PASS: A5. centre A admin creates student tagged centre B denied
- PASS: A6. centre A admin queries centre B students denied
- PASS: A7. centre A admin queries own centre students allowed
- PASS: A8. centre A admin updates own-centre student allowed
- PASS: A9. centre A admin re-tags own student to centre B denied
- PASS: A10. centre A admin creates student in own centre allowed

**Group B - Fail-closed edges (no-centre admins, legacy untagged records, platform staff cross-centre)**

- PASS: B1. admin with no centreId reads any student denied
- PASS: B2. centre A admin reads legacy student without centreId denied
- PASS: B3. platform staff updates centre B student allowed
- PASS: B4. platform staff lists all students unfiltered allowed

**Group C - Student self-access unchanged by G2**

- PASS: C1. student A reads own record allowed
- PASS: C2. student A reads centre B student denied
- PASS: C3. student A changes own paidAmount denied
- PASS: C4. student A lists own record via uid filter allowed

**Group D - Payments: centre-scoped admin reads, student self-reads unchanged**

- PASS: D1. centre A admin reads own-centre payment allowed
- PASS: D2. centre A admin reads centre B payment denied
- PASS: D3. student A reads own payment allowed

**Group E - Tutors: centre-scoped admin writes, tutor self-write unchanged**

- PASS: E1. centre A admin invites tutor into centre A allowed
- PASS: E2. centre A admin invites tutor into centre B denied
- PASS: E3. centre A admin updates centre B tutor denied
- PASS: E4. tutor A self-update unchanged allowed

**Group F - Admissions: centre-scoped admin reads and writes**

- PASS: F1. centre A admin reads own-centre admission allowed
- PASS: F2. centre A admin reads centre B admission denied
- PASS: F3. centre A admin approves centre B admission denied

**Group G - Attendance and results: centre-scoped admin and tutor paths**

- PASS: G1. centre A admin marks attendance in own centre allowed
- PASS: G2. centre A admin marks attendance tagged centre B denied
- PASS: G3. centre B admin reads centre A attendance denied
- PASS: G4. tutor A updates centre A result allowed
- PASS: G5. tutor A updates centre B result denied
- PASS: G6. centre A admin updates centre B result denied

**Group H - Activities: centre-scoped admin reads and writes**

- PASS: H1. centre A admin reads own-centre activity allowed
- PASS: H2. centre A admin reads centre B activity denied
- PASS: H3. centre B admin edits centre A activity denied

## How to reproduce

```
cd /workspace/tos-e
export PATH=/workspace/tools/node-v22.14.0-linux-x64/bin:/workspace/tools/jre21/bin:$PATH
npx firebase-tools emulators:exec --only firestore --project demo-tos-rules \
  "node tests/rules/dirtyDozen.rules.test.mjs && node tests/rules/centreScope.rules.test.mjs"
```

Result observed: exit code 0, 81 PASS lines, 0 FAIL lines, both suites print their pass counts (44/44 and 37/37).

## What these tests prove and what they do not

Proven (against the emulator running the exact live rules):
- A centre admin can no longer read, edit, delete, create or query another centre's student records, including fee fields (`paidAmount`, `totalFee`, `outstandingBalance`, `paymentStatus`).
- Admin reads on payment records are centre-scoped; the payment create/update/delete deny-all is unchanged and still enforced.
- Records cannot be re-tagged from one centre to another.
- An admins record without a centre, and legacy records without a `centreId`, fail closed rather than open.
- Platform staff (`tos` claim) retain cross-centre access, and ordinary student access is unchanged.

Not covered by these tests (honest limits):
- The emulator tests rules only. The 23 server-side admin doors (`fo-db-proxy`), the billing sweep, and the payment confirm route are code paths behind the API, not Firestore rules; they are not exercised here.
- Catalog collections (programmes, subjects, classrooms, announcements, timetable, branches, cms, cbt_questions, cbt_exams, mock_grading, studyMaterials, classRatings) still allow any admin to write from the browser (reads were already centre-filtered client-side). This is the planned Stage B; it is a deliberate deferral, not a regression.
- Mocks, mockKeys, mockPapers etc. remain deny-all to all clients by design (staff-owned via server routes); covered by a separate 81-check mock suite run previously.
- The project's second, unused database (`ai-studio-8f17639e...`) still carries its own older ruleset; the app does not use it.

## Verification of the live publish

- The live ruleset on the production database was read back through the project's own read-only door and byte-compared with `firestore.rules` at commit `66a3d21`: exact match, including all three G2 helper functions.
- Dry-run backfill (read-only) confirmed 0 untagged records, so the fail-closed rule hides no data from centre admins.
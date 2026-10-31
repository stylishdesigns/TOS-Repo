# Tutorial OS Tenant Migration Plan & Data Audit

## 1. Overview
Tutorial OS is transitioning from a single-tenant architecture (currently hosting Excellence Tutorial Centre; the Firebase project ID is supplied through the `FIREBASE_PROJECT_ID` environment variable) to a multi-tenant SaaS for tutorial centres across Nigeria.

This audit documents every Firestore collection read and written by the application, assumed document IDs, onSnapshot listeners, write call sites, and localStorage cache keys. It also outlines the multi-tenant data model, custom claims strategy, backfill execution, client-side query scoping, and two-stage security rules.

---

## 2. Comprehensive Firestore Collection Audit

| # | Collection Path | Assumed Doc IDs / Patterns | Read Locations (Listeners & Direct Queries) | Write Locations (Create, Update, Delete) | LocalStorage Cache Keys | Multi-Tenant Scoping Strategy |
|---|---|---|---|---|---|---|
| 1 | `settings` | `global`, `attendance`, `${centreId}__global`, `${centreId}__attendance` | - `AppContext.tsx`: `onSnapshot(doc(db, 'settings', 'global'))`<br>- `AppContext.tsx`: `onSnapshot(doc(db, 'settings', 'attendance'))` | - `AppContext.tsx` (`updateSettings` -> `settings/global`)<br>- `AppContext.tsx` (`updateAttendanceSettings` -> `settings/attendance`)<br>- `AppContext.tsx` (`resetToDefaultData`) | `${STORAGE_KEY}_settings`<br>`${STORAGE_KEY}_attendanceSettings` | Scope per centre as `${centreId}__global` and `${centreId}__attendance` with fallback to `global` / `attendance`. |
| 2 | `admins` | `{adminId}` (or `{authUid}`) | - `AppContext.tsx`: `onSnapshot(collection(db, 'admins'))`<br>- `AppContext.tsx`: `query(collection(db, 'admins'), where('email', '==', u.email))` | - `AppContext.tsx` (`addAdmin`, `updateAdmin`, `deleteAdmin`, `updateAdminStatus`)<br>- `AppContext.tsx` auth listener bootstrap<br>- `AuthPortal.tsx` legacy migration | `${STORAGE_KEY}_admins` | Add `centreId`. Query by `where('centreId', '==', activeCentreId)` (or global lookup for platform staff). |
| 3 | `students` | `{studentId}` (or `{authUid}`) | - `AppContext.tsx`: `qStudents` (`query(collection(db, 'students'))` or `where('uid', '==', user.uid)`) | - `AppContext.tsx` (`addStudent`, `updateStudent`, `deleteStudent`, `approveAdmission`)<br>- `AuthPortal.tsx` (`setDoc(doc(db, 'students', uid), ...)`)<br>- `StudentOnboarding.tsx` (`setDoc(doc(db, 'students', user.uid), ...)`) | `${STORAGE_KEY}_students` | Add `centreId`. Query scoped by `centreId` (and `uid` for students). |
| 4 | `admissions` | `{admissionId}` | - `AppContext.tsx`: `qAdmissions` (`query(collection(db, 'admissions'))` or `where('email', '==', user.email)`) | - `AppContext.tsx` (`submitAdmission`, `approveAdmission`, `rejectAdmission`) | `${STORAGE_KEY}_admissions` | Add `centreId`. Public applications or centre admissions include `centreId`. |
| 5 | `tutors` | `{tutorId}` (or `{authUid}`) | - `AppContext.tsx`: `onSnapshot(collection(db, 'tutors'))`<br>- `AppContext.tsx`: `query(collection(db, 'tutors'), where('email', '==', u.email))` | - `AppContext.tsx` (`addTutor`, `updateTutor`, `deleteTutor`)<br>- `AuthPortal.tsx` legacy migration | `${STORAGE_KEY}_tutors` | Add `centreId`. Query scoped by `centreId`. |
| 6 | `programmes` | `{programmeId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'programmes'))` | - `AppContext.tsx` (`addProgramme`, `updateProgramme`) | `${STORAGE_KEY}_programmes` | Add `centreId`. Query scoped by `centreId`. |
| 7 | `payments` | `{paymentId}` | - `AppContext.tsx`: `onSnapshot(query(collection(db, 'payments')))` | - `AppContext.tsx` (`addPayment`) | `${STORAGE_KEY}_payments` | Add `centreId`. Query scoped by `centreId`. |
| 8 | `branches` | `{branchId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'branches'))` | - `AppContext.tsx` (`addBranch`, `updateBranch`) | `${STORAGE_KEY}_branches` | Add `centreId`. Query scoped by `centreId`. |
| 9 | `attendance_logs`| `{logId}` (`{studentId}_{date}`) | - `AppContext.tsx`: `qAttendance` (`query(collection(db, 'attendance_logs'))` or `where('studentId', '==', user.uid)`) | - `AppContext.tsx` (`logAttendance`, `clockOutAttendance`) | None | Add `centreId`. Query scoped by `centreId` (and `studentId` for students). |
| 10 | `announcements` | `{announcementId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'announcements'))` | - `AppContext.tsx` (`addAnnouncement`, `deleteAnnouncement`) | `${STORAGE_KEY}_announcements` | Add `centreId`. Query scoped by `centreId`. |
| 11 | `subjects` | `{subjectId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'subjects'))` | - `AppContext.tsx` (`addSubject`, `updateSubject`, `deleteSubject`) | `${STORAGE_KEY}_subjects` | Add `centreId`. Query scoped by `centreId`. |
| 12 | `classrooms` | `{classroomId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'classrooms'))` | - `AppContext.tsx` (`addClassroom`, `updateClassroom`, `deleteClassroom`) | `${STORAGE_KEY}_classrooms` | Add `centreId`. Query scoped by `centreId`. |
| 13 | `timetable` | `{slotId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'timetable'))`<br>- `AuthPortal.tsx`: `query(collection(db, 'timetable'), where('tutorId', '==', legacyId))` | - `AppContext.tsx` (`addTimetableSlot`, `batchCreateTimetableSlots`, `updateTimetableSlot`, `deleteTimetableSlot`, `updateClassChangeStatus`)<br>- `AuthPortal.tsx` legacy tutor update | `${STORAGE_KEY}_timetable` | Add `centreId`. Query scoped by `centreId`. |
| 14 | `results` | `{resultId}` | - `AppContext.tsx`: `qResults` (`query(collection(db, 'results'))` or `where('studentId', '==', user.uid)`) | - `AppContext.tsx` (`addResult`)<br>- `AssessmentTab.tsx` (`setDoc(doc(db, 'results', resultId), ...)`) | `${STORAGE_KEY}_results` | Add `centreId`. Query scoped by `centreId` (and `studentId` for students). |
| 15 | `cbt_questions` | `{questionId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'cbt_questions'))` | - `AppContext.tsx` (`addCBTQuestion`) | `${STORAGE_KEY}_cbt` | Add `centreId`. Query scoped by `centreId`. |
| 16 | `cbt_exams` | `{examId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'cbt_exams'))` | - `CBTManager.tsx` (`setDoc`, `deleteDoc`)<br>- `AssessmentTab.tsx` (`setDoc`, `deleteDoc`)<br>- `CbtTab.tsx` (`updateDoc(examRef, ...)`) | None | Add `centreId`. Query scoped by `centreId`. |
| 17 | `activities` | `{activityId}` | - `AppContext.tsx`: `qActivities` (`query(collection(db, 'activities'))`) | - `AppContext.tsx` (`logActivity`) | `${STORAGE_KEY}_activities` | Add `centreId`. Query scoped by `centreId`. |
| 18 | `cms` | `main` | - `AppContext.tsx`: `onSnapshot(doc(db, 'cms', 'main'))` | - `AppContext.tsx` (`updateCMSContent`) | `${STORAGE_KEY}_cms` | Add `centreId` or `${centreId}__main` with fallback to `main`. |
| 19 | `mock_grading` | `{programmeId}` | - `CBTManager.tsx`: `onSnapshot(collection(db, 'mock_grading'))` | - `CBTManager.tsx` (`setDoc(doc(db, 'mock_grading', grading.programmeId), ...)`) | None | Add `centreId`. Query scoped by `centreId`. |
| 20 | `classRatings` | `{ratingId}` (`{slotId}__{studentId}`) | - `AppContext.tsx`: `onSnapshot(collection(db, 'classRatings'))`<br>- `ClassRatingSheet.tsx`: `getDoc(doc(db, 'classRatings', ratingDocId))` | - `AppContext.tsx` (`addClassRating`) | None | Add `centreId`. Query scoped by `centreId`. |
| 21 | `studyMaterials` | `{materialId}` | - `AppContext.tsx`: `onSnapshot(collection(db, 'studyMaterials'))` | - `AppContext.tsx` (`addStudyMaterial`) | `${STORAGE_KEY}_studyMaterials` | Add `centreId`. Query scoped by `centreId`. |

---

## 3. New Multi-Tenant Collections (Prompt 1)

1. `centres/{centreId}`
   - Data: `name`, `status` ('trial' | 'active' | 'overdue' | 'suspended' | 'closed'), `ownerUid`, `branding` (logo, colours), `audienceTypes` (string[]), `autoApproveStudents` (boolean), `createdAt`.
2. `centreBilling/{centreId}` (TOS staff only)
   - Data: `planId`, `seatCap`, `billedSeatsMinimum`, `trialStartsAt`, `trialEndsAt`, `skippedTrial`, `discountPct`, `paidThrough`, `notes`.
3. `accessCodes/{code}`
   - Data: `{ centreId }`. Document ID is the 6-digit numeric access code. Server-only writes, non-client-readable.
4. `memberships/{uid}__{centreId}`
   - Data: `uid`, `centreId`, `role` ('owner' | 'admin' | 'secretary' | 'finance' | 'tutor' | 'student'), `status` ('pending' | 'active' | 'disabled'), `createdAt`, `updatedAt`. Written only by server.
5. `platformPlans/{planId}`
   - Data: `price`, `seatCap`, `trialSeatCap`, `trialDays`, `studentChat`, `whatsappNotifications`, `aiEssayMarking`, `aiQuestionGen`, `aiPerformanceAnalysis`.
6. `platformConfig/global`
   - Data: `trialDays` (30), `skipTrialDiscountPct`, `trialGraceDays`.
7. `auditLogs/{id}`
   - Data: `actorUid`, `centreId?`, `action`, `before`, `after`, `at`. Server-written.

---

## 4. Custom Claims Architecture & Identity Sync

- Endpoint: `POST /api/session/sync`
  - Validates client Bearer ID Token using `firebase-admin.auth().verifyIdToken()`.
  - Queries `memberships` for `uid == decodedToken.uid && status == 'active'`.
  - Constructs claims object:
    `{ m: { [centreId]: roleCode }, tos?: true }`
    Where `roleCode` is concise to respect the 1,000-byte token size limit:
    - `'owner'` -> `'own'`
    - `'admin'` -> `'adm'`
    - `'secretary'` -> `'sec'`
    - `'finance'` -> `'fin'`
    - `'tutor'` -> `'tut'`
    - `'student'` -> `'stu'`
  - Calls `admin.auth().setCustomUserClaims(uid, claims)`.
  - Client forces token refresh `user.getIdToken(true)`.

---

## 5. Security Rules Phasing

- **Stage A (`firestore.rules`):**
  - Backward compatible: an operation succeeds if the existing legacy check passes OR the multi-tenant claim check passes:
    `request.auth.token.m[resource.data.centreId] in ['own', 'adm', ...]`
  - Ensures zero downtime for Excellence Tutorial Centre.
- **Stage B (`firestore.rules.stageB`):**
  - Legacy checks removed.
  - Strict tenant isolation enforced purely via custom claims without costly `get()` or `exists()` document reads on tenant checks.

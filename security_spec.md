# Security Specification: Remix Excellence Tutorial Centre

## Data Invariants
1. Only authenticated users can read or write non-public data.
2. Admins have full access to all collections.
3. Students can only read their own profile, results, and payments.
4. Tutors can read their own profile and edit/read academic data related to their assigned programmes.
5. Public admissions are write-only for non-authenticated users if `allowPublicAdmissions` is true.

## The Dirty Dozen Payloads
1. **Unauthenticated Write**: Attempting to update `settings/global` without being logged in.
2. **Student PII Leak**: Student A trying to read Student B's private profile.
3. **Admin Escalation**: A standard user attempting to create a document in the `admins` collection.
4. **Fee Tampering**: A student attempting to reduce their `outstandingBalance` in the `students` collection.
5. **Orphaned Student**: Creating a student record with a non-existent `programmeId`.
6. **Fake Payment**: Manually injecting a `Payment` record with a high `amountPaid` to trick the system.
7. **Role Spoofing**: A tutor attempting to change their status to 'Active' after being 'Suspended' by an admin.
8. **Junk ID Poisoning**: Creating a branch with a 1MB string as the ID.
9. **Timestamp Manipulation**: Manually setting `createdAt` to a date in the future.
10. **Global Delete**: An unauthenticated user attempting to delete the `settings/global` document.
11. **Query Scraping**: A student attempting to list ALL students without a `where` filter for their own ID.
12. **Status Shortcutting**: An admission applicant changing their status from 'Pending' to 'Approved' directly.

## Rules Draft Strategy
- Use `isValidId` for all path variables.
- Implement `isAdmin()` using a separate `admins` collection lookup.
- Use `isValid[Entity]` helpers for create/update.
- Restrict `list` operations for students to their own `uid`.

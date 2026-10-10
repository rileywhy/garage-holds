# Accounts and a shared library

## Decisions

- Keep Next.js, React, and TypeScript. Maintainability takes priority over feature count.
- Use Supabase Auth for email codes and Google sign-in, Supabase Postgres for shared records, and Cloudflare R2 for original files and photos.
- Browsing and free downloads remain open. An account is required to upload, review, or save designs across devices.
- Keep bundles, subscriptions, and payment entitlements for a later milestone.

## First usable slice

1. **Sign in and profiles.** Build email-code verification, Google sign-in, sign-out, and session handling. Create one profile per authenticated user. Use an immutable user ID for ownership; display names are editable labels. Keep the upload form's creator name only in local mode.
2. **Owned drafts.** Add a creator's design list with draft/published state and edit/delete actions. Check ownership on the server and in Postgres policies. Test with two separate users: one cannot read the other's drafts, edit their designs, or delete their files. Public visitors can read published designs only.
3. **One complete hosted upload.** Create the draft, authorize file uploads, verify uploaded objects, and publish only after required model files are confirmed. Tie files to the owning draft rather than accepting arbitrary object keys. Enforce file counts, sizes, and supported types at the trusted boundary. Show an explicit completion state after publication.
4. **Shared browsing, reviews, and bookmarks.** Read real records from the database with pagination. Associate reviews and bookmarks with authenticated IDs. Update profiles without rewriting the creator name on every design.
5. **Storage lifecycle and local import.** Handle failed uploads, abandoned drafts, replaced files, and deletion. Offer an explicit import of existing browser-local designs into the user's account; preserve the local originals until the hosted save succeeds. Do not silently claim local uploads as belonging to whoever happens to sign in.

This is one end-to-end milestone: a user signs in, uploads a design, sees it from another browser, edits their own design, and cannot edit someone else's.

## Targeted cleanup during implementation

- Preserve the existing feature folders and plain TypeScript validation/filtering. Avoid a broad rewrite or generic component framework.
- Extract construction of an upload draft from the form when hosted and local saving need to share it. Keep metadata conversion separate from network/storage work.
- Introduce a small repository boundary when there are two actual persistence implementations. Make asset access work through it as well; today photos, previews, and downloads all read IndexedDB directly.
- Review `supabase/migrations/0001_library.sql` before applying it. Publication must require confirmed files; the current draft schema allows owners to change the status directly. Add policies, constraints, and trusted publication handling with integration tests rather than treating the proposal as production-ready.
- Keep theme colors in the shared CSS variables. Add new surfaces to both palettes together.

## Configuration needed

A development Supabase project, its public URL/publishable key, configured email delivery and Google OAuth credentials, and an R2 bucket with server-only credentials. Configure allowed sign-in redirects for local development and deployment. No production secrets belong in browser code.

## Validation

Test session expiry and sign-out, ownership with two users, anonymous browsing, upload interruption/retry, failed publication, original-file downloads, and file cleanup. Verify the main flows on mobile and in both themes. Keep domain tests alongside these integration checks.

Official setup references: [email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

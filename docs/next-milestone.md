# Accounts and a shared library

## Decisions

- Keep Next.js, React, and TypeScript. Maintainability takes priority over feature count.
- Use Supabase Auth for email codes and Google sign-in, Supabase Postgres for shared records, and Cloudflare R2 for original files and photos.
- Browsing and free downloads remain open. An account is required to upload, review, or save designs across devices.
- Keep bundles, subscriptions, and payment entitlements for a later milestone.

## First usable slice

1. **Sign in and profiles.** _Code in place; needs the Supabase project configured per `docs/hosted-setup.md` and a browser pass._ Email-code verification, Google sign-in, sign-out, session refresh, one profile per user created by a database trigger, immutable user id for ownership, unique editable display names. The upload form's creator name stays only in local mode.
2. **Owned drafts.** _Schema and policies in place; "My designs" page with metadata edit still to build._ Ownership is checked on the server and in Postgres policies. Two-user tests (one cannot read the other's drafts or change their designs) run against the local Supabase stack once that is set up.
3. **One complete hosted upload.** _Built; needs R2 configured and a browser pass._ Draft → signed PUT URLs tied to the draft's own object keys → server verifies each object → publish, which the database refuses without a verified model file.
4. **Shared browsing, reviews, and bookmarks.** _Built._ Records come from the database as the signed-in user; reviews and bookmarks belong to profile ids; creator names come from profiles at read time. Pagination still to do.
5. **Storage lifecycle.** Handle failed uploads, abandoned drafts, replaced files, and deletion. Browser-local storage was removed rather than imported.

This is one end-to-end milestone: a user signs in, uploads a design, sees it from another browser, edits their own design, and cannot edit someone else's.

## Targeted cleanup during implementation

- Preserve the existing feature folders and plain TypeScript validation/filtering. Avoid a broad rewrite or generic component framework.
- Extract construction of an upload draft from the form when hosted and local saving need to share it. Keep metadata conversion separate from network/storage work.
- `src/features/holds/repository.ts` is the read boundary; photos, previews, and downloads all use the signed URLs it attaches.
- Publication requires confirmed files at the database level (`enforce_publication` trigger). Integration tests for the policies are the next piece.
- Keep theme colors in the shared CSS variables. Add new surfaces to both palettes together.

## Configuration needed

A development Supabase project, its public URL/publishable key, configured email delivery and Google OAuth credentials, and an R2 bucket with server-only credentials. Configure allowed sign-in redirects for local development and deployment. No production secrets belong in browser code.

## Validation

Test session expiry and sign-out, ownership with two users, anonymous browsing, upload interruption/retry, failed publication, original-file downloads, and file cleanup. Verify the main flows on mobile and in both themes. Keep domain tests alongside these integration checks.

Official setup references: [email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

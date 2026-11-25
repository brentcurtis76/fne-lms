# GENERA correos, release 1: the email kit's look, mailing lists and contacts, reached only by typing the address, and nobody is mailed

Branch: `correos/r1`. Base: `5542c952b` (main, 25 Nov 2026, pull request 213: the fixes' third release of 24 Nov, awarded tenders never deleted, the Carta's signer and contract files behind five-minute links).
A straight line of commits on main, no merge commits, 13 in all: 9 commits of two phases (phase 1, the look: 2 commits; phase 2, lists and contacts: 3 commits; then 3 commits of fixes after the code reads and the looks by sight, and 1 commit that declares the list-name key with its table), this request (3 commits), and 1 commit that rebuilds the package lock.

- `31bc9fedd` correos r1 phase 1: the look (kit, GENERA brand, preview page and test send)
- `7a9bc6913` correos r1 phase 1 fix: no stray colours in the template or the preview page
- `9298935db` correos r1 phase 2 (database): lists, members, settings, picture store, add and erase functions
- `6698733c9` correos r1 phase 2 (screens): lists, contacts, CSV import, GENERA users, pasantías leads, erase
- `1a9e501f4` correos: read admin route handlers by fixed name
- `88d3d374d` correos: strip hidden characters from addresses; erase empties tags
- `5bc3bcd05` correos: literal search, hidden-character cleaning, pickers keep paging
- `46773e1d3` correos: erasure empties the consent notice version
- `1080232a1` correos: the list-name key is declared with its table (same rule, a form the release check can carry)
- `e49c48d79` fix(deps): rebuild package-lock from main with Node 22 so npm ci passes on CI

The package lock now starts from main's and only adds the two email packages (`@react-email/components` 1.0.12, `@react-email/render` 2.0.6) and what they depend on (25 added entries, none of main's removed; the older `@react-email/render` 0.0.16 that `resend` needs stays, nested under `resend`), because the earlier lock had been written by a newer npm than the Node 22 the checks use, which read it as out of sync with `package.json`.

## Approved scope

The owner approved the correos plan on 24 Nov 2026 ("i approve"). It has five releases; this is the first, phases 1 and 2. Its rule on screen: nothing new, unless an admin types the address. Nothing in release 1 mails anybody but the admin's own test send; the signup page, unsubscribe, campaigns and reports come in releases 2 and 3.

## What changes

**For everyone**
- Nothing looks different. There is no menu entry, no public page and no email to anybody.

**For an admin who types one of these addresses by hand**
- `/admin/correos/vista-previa`: a sample email in GENERA's look (logo, accent colour, font, button, legal footer), and «send me a test», which goes through today's sender to the admin's own address only.
- `/admin/correos/listas`: the mailing lists (create, rename, describe, public or not, archive). The two day-one lists, «Boletín general» (public) and «Directivos» (not public), are created by the release. A list is never deleted; archiving retires it.
- `/admin/correos/contactos`: search, add one person, see a person's lists and state, and «erase this person».
- `/admin/correos/importar`: a CSV import. The admin states, for the whole file, where the permission to mail came from; the result shows accepted, duplicates, blocked and bad addresses.
- `/admin/correos/usuarios`: add GENERA users to a list.
- `/admin/correos/pasantias`: add pasantías leads, only those who ticked the box.

**The email kit**
- `lib/correos/` is the kit: one base template driven by a brand file (GENERA's is the first), with the styles inline in the HTML. The kit imports nothing of GENERA; GENERA's side lives in `lib/correos-host/`. The screens use the redesign's kit `components/ui/kit/` without changing it.

## Database

Four migrations, add-only, all new:
- `20261124200000_email_campaign_images_store.sql`: a picture store `email-campaign-images` (public reading, 5 MB, png, jpeg, gif and webp only) and three restrictive storage rules, so that only the server writes into it.
- `20261124200100_email_lists_and_members.sql`: three new tables (`public.email_lists`, `public.email_list_members`, `public.email_settings` with one row, a daily limit of 500) and two new columns on `public.email_suppression` (`erased_at`, `erased_by`). Admins read; only the server writes, and DELETE and TRUNCATE are revoked on the new tables even from the service role.
- `20261124200200_email_contact_functions.sql`: three functions, server only: `public.email_address_fingerprint(text)`, `public.email_add_contacts(...)` and `public.email_erase_contact(uuid, uuid)`. Erasure removes a person's address from the contact and from past sends, ends the memberships and empties their free-text notes; it deletes no row.
- `20261124200300_email_lists_seed.sql`: the two day-one lists; running it again creates nothing.

No function of this release deletes rows, so `.pm-publish/solo-preflight.json` declares none, and it holds no count check either, because none is needed: every unique key of this release (`email_lists_name_key`, `email_list_members_list_contact_key` and `email_list_members_confirmation_token_key`) is declared inside the `CREATE TABLE` of a table the release itself creates, so no existing row can break it, and the publisher's static check raises no flag on any of the four files. The list-name key is a constraint on a stored column (`name_norm`, which the database keeps as `lower(btrim(name))`) rather than a separate unique index, so that it can be declared with its table and keep the same rule, the same name and the same error code. Every rule survives a dump and rebuild (1,091 rules, 0 different).

Recovery without a destructive statement: the three functions can be replaced in place, or switched off by revoking EXECUTE from the service role; the screens are reached only by address.

## Proof

On `e49c48d79` (25 Nov 2026, after the rebase onto main `5542c952b` and the package-lock repair): a clean install with `npm ci` under Node 22 (the version the checks use) from a clean copy, 1,434 packages; type check, lint (no warnings allowed), the pages inventory check (543 files: 162 screen files, 381 API files), the browser-boundary guard and the destructive-migration check (133 migration files), each exit status 0; the whole unit suite, 823 files passed and 1 skipped, 22,700 tests passed and 19 skipped, none failed; the database tests on a fresh local database, 117 files, 11,276 tests, PASS (the new files `041-email-lists-rls.sql` and `042-email-contact-functions.sql` among them); the rules after a dump and rebuild, 1,091, 0 different; CI's browser list as CI runs it, 367 passed, none failed, none flaky, 34 mandatory specs ran, no skips; a code read of the rebased release by a second model, clean (the lock commit after it changes no code).

The 49 regenerated files under `docs/plan/redesign/inventory/` stay in this branch on purpose: the inventory check wants every area file read from one commit, and it fails without them.

**No blind test by the third model this time.** The rules of this work ask for a blind test by a third model before every release. It was started and was cut off in round 1 by its provider's content filter, and it was not repeated. In its place stand three reads of the whole branch by a second model (the third came back clean) and two looks by sight in a real browser. That is not the independent test the rules name.

## What a reviewer should look at first

1. `email_add_contacts`: who may call it, that a blocked address cannot come back by any of the four ways in, that a person who left by their own choice is not re-subscribed by an import, and that a lead who did not tick the box cannot be added.
2. `email_erase_contact`: what it empties, and that it deletes nothing.
3. The rules of the three new tables and of the picture store: a non-admin and a visitor read and write nothing.
4. `lib/correos/`: it imports nothing of GENERA.
5. The search on the contacts screen: what the admin types is matched literally.

## Known and left for later (release 2)

In the people pickers a slow earlier search answer can replace a newer one; on the import screen the button stays disabled without saying why; after adding people the first line of the result sits under the top bar; there are small display faults at phone width.

No credentials, no personal data in tests (invented people only), no Production action by any agent.

## Used by sight

Twice, in a real browser on invented local data. The faults the first look and the code reads found were fixed in the last three commits; the second look passed every must-fix, and two small faults it found are among those left for later.

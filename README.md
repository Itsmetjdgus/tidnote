# Tidnote

A blog for everyday life and interests. Write posts with photos, pick a category, and follow people to read theirs, with people from different countries and cultures.

Status: in development (closed beta planned for 2027-01-01).

- Live: https://itsmetjdgus.github.io/tidnote/
- Languages: Korean, English

## Features

- Sign up (age 14+, terms consent), log in, password reset and change, account deletion
- Write, edit, and delete posts with formatting, preview, a cover photo, a category (9 kinds), and hashtags
- New-post draft saved in the browser so nothing is lost
- Home feed: latest first, 10 per page, search, category and tag filters, and a "Following" tab
- Follow, private accounts (follow requests), connections page, people search, blocking
- Comments, likes, profile photo and short bio, a blog page for each user
- Reporting (posts, comments, profiles), feedback form, help page with crisis resources
- Terms and privacy policy with re-consent when the terms version changes

## Tech

- HTML, CSS, and vanilla JavaScript: no build step, no bundler, plain `<script>` tags
- Supabase: Auth, Postgres with Row Level Security, Storage
- GitHub Pages for hosting
- `supabase-js` is loaded from jsDelivr with a pinned version and Subresource Integrity (SRI)

## Project layout

| Kind | Files |
| --- | --- |
| Pages | `index.html` (feed), `post.html`, `write.html`, `author.html` (user blog), `people.html`, `connections.html`, `settings.html`, `login.html`, `forgot.html`, `reset.html`, `report.html`, `help.html`, `terms.html`, `privacy.html`, `404.html` |
| Shared | `supabase.js` (client), `nav.js` (header, search, account menu, terms version), `i18n.js` (all UI text, `t()`), `style.css` |
| Features | `feed.js`, `post.js`, `write.js`, `editor.js`, `markdown.js`, `render.js`, `comments.js`, `like.js`, `follow.js`, `block.js`, `report.js`, `profile-header.js`, `avatar.js`, `image.js`, `categories.js`, `settings.js`, … |
| Modals | `login-modal.js`, `signup-modal.js`, `consent.js` (loaded only when needed) |
| Database | `schema.sql` (tables, RLS policies, triggers, functions), `ops.sql` (operator runbook) |
| Dev checks | `check-i18n.js`, `check-sri.js` (not loaded by the site) |
| Automation | `.github/workflows/keep-alive.yml` (daily ping so the free Supabase project is not paused) |

## Run locally

Any static file server works. From the repository folder:

```bash
python3 -m http.server 5504
```

Then open http://localhost:5504/. In VS Code or GitHub Codespaces, the Live Server extension also works (port 5504 is set in `.vscode/settings.json`).

The site talks to the live Supabase project in `supabase.js`. Only the public (publishable) key is in this repository; it is safe in the browser because every table is protected by Row Level Security.

## Checks before every commit

```bash
node check-i18n.js
```

```bash
node check-sri.js
```

```bash
for f in *.js; do node --check "$f"; done
```

- `check-i18n.js`: every key exists in both Korean and English, every key used in code exists, and the terms/privacy effective dates match `TERMS_VERSION`.
- `check-sri.js`: every page loads `supabase-js` with the same pinned version and integrity hash.
- Add new UI text only to `i18n.js` (both `ko` and `en`) and show it with `t('key')`.

## Deploy

Pushing to `main` publishes the site on GitHub Pages within a minute or two. There is no staging site, so:

1. Work on a branch and open a pull request.
2. Check the pages on a phone width (360 px) and a desktop width (1280 px).
3. Merge to `main`.

### Database changes

`schema.sql` is the record of what has been run in the Supabase SQL Editor; it is not applied automatically.

- Adding something: run the SQL first, then push the code that uses it.
- Rolling back: revert the code first, then undo the SQL.

## Operating the beta

`ops.sql` is a runbook for the Supabase SQL Editor. Select one block and run only that block.

- Daily: open reports (block 1) and new feedback (block 12)
- Before launch: security checks (blocks 14–18: RLS on, policies, no anonymous write policies, terms version, function permissions)
- Monthly: storage use (block 10)

### Posting a notice after acting on a report

The "Notices of actions taken" list on `report.html` is static HTML, so it is updated with a normal commit.

1. Act on the report with the `ops.sql` blocks (remove content or suspend, then close the report).
2. In `report.html`, add one line to **both** lists: `#notices` (English) and `#notices-ko` (Korean). Remove the "No actions have been taken yet." line the first time.
3. Write only the date, the kind of content, and the rule it broke, for example `2027-01-15: A post was removed for sharing someone else's personal information.` Never include nicknames, user IDs, post text, or anything that identifies the reporter or the reported user.
4. Commit, open a pull request, check the page, and merge.

## Security

- Row Level Security on every table, so users can only change their own data
- Database constraints and triggers: length limits, rate limits, timestamp protection
- Private-account and block rules are enforced in the database, not only in the page
- Post photos are in a private bucket and shown through short-lived signed URLs
- No secret keys in this repository

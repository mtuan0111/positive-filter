---
name: sync-claude-md
description: Reviews recent code changes in this repo (git diff / modified files) against the root CLAUDE.md and updates CLAUDE.md so its architecture description, file list, and behavior notes stay accurate. Use this after finishing any implementation task in the gemini-positivity-filter Chrome extension — new files, renamed/removed files, changed function signatures, changed message-passing contracts, changed storage keys, changed permissions in manifest.json, or changed control flow between background.js/content.js/popup.js. Also use it when explicitly asked to "sync", "update", or "check" CLAUDE.md, or before finishing a task that touched any of: manifest.json, background.js, content.js, popup.js, lib/*.js, popup/*.js.
---

# Sync CLAUDE.md with source

CLAUDE.md is the single source of truth Claude Code reads before touching this
repo. If it drifts from the real code — a renamed file, a moved responsibility,
a changed storage key, a new permission — every future session inherits wrong
assumptions and wastes turns rediscovering reality. This skill closes that loop
after a task: verify CLAUDE.md still matches what the code actually does, and
fix any part that doesn't.

## When to run this

Run it near the end of a task, after the code changes are in their final form
for this turn — not mid-edit. Good triggers:

- You added, removed, renamed, or moved a file under `lib/`, `popup/`, or the
  repo root JS files.
- You changed what a function does, its signature, or which module owns a
  responsibility described in CLAUDE.md's architecture section.
- You changed a `chrome.storage.local` key name, a message `action` name, an
  API endpoint, a caching strategy, or anything else CLAUDE.md calls out by
  name.
- You changed `manifest.json` permissions or content-script registration.
- The user asks you to check/update/sync CLAUDE.md directly.

Skip it for changes that don't touch anything CLAUDE.md describes (e.g. a pure
CSS tweak, a comment fix, a typo in a string shown to the end user).

## Procedure

1. **Scope the diff.** Run `git diff` (and `git status` for untracked files)
   to see what actually changed this session. If there's no working-tree diff
   to inspect (e.g. changes were already committed), use `git log -1 --stat`
   or ask the user which commit/range to check.

2. **Read CLAUDE.md's "Architecture" section fully.** Don't skim — it
   describes each file's responsibility, the message-passing contract between
   `background.js`/`content.js`/`popup.js`, storage keys, caching behavior,
   and the "Key implications" bullets. Hold this against the diff.

3. **Compare claim by claim.** For every file touched in the diff, check
   whether CLAUDE.md's description of that file is still true:
   - Does the file tree diagram at the top still list every real file (no
     missing new files, no stale entries for deleted ones)?
   - Does the prose description of that file's responsibility, the functions
     it exports, and how it's called still match?
   - Do any storage keys, message action names, cache key formats, or API
     endpoints named in CLAUDE.md still match the code exactly? These are
     the details most likely to silently drift, since they're strings, not
     types — nothing will error if they diverge.
   - Do the "Key implications when touching classification" bullets (or
     equivalent caveats) still hold, or did this change fix/introduce one of
     the tradeoffs they describe?

4. **Update CLAUDE.md in place** for anything that's now inaccurate. Match
   the existing document's voice and structure — this file is dense,
   specific, and avoids generic filler; new sentences should read like they
   belong. Prefer editing the smallest span that fixes the inaccuracy over
   rewriting whole sections. If a new file or responsibility genuinely has no
   home in the existing structure, add it in the place a reader would expect
   it (e.g. new `lib/*.js` module → the file tree + the `background.js`
   bullet list), don't bolt on a new top-level section unless the change is
   architecturally significant enough to warrant one.

5. **Don't invent documentation for things CLAUDE.md doesn't already cover.**
   This skill keeps existing claims accurate — it is not a prompt to
   document every function in the codebase. If CLAUDE.md never described a
   file in detail, a small change to that file usually doesn't need a new
   paragraph.

6. **Report what you changed**, briefly: which claims were stale and what
   you corrected. If nothing in CLAUDE.md was affected by the diff, say so
   plainly instead of making cosmetic edits to justify having run the check.

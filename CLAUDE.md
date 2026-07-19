# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome Extension (Manifest V3) called "Gemini Positivity Filter". It scans text on any web page and uses the Gemini API to detect negative/toxic/low-value content, then blurs matching elements with a click-to-reveal overlay.

There is no build system, package manager, bundler, linter, or test suite — the extension runs directly from raw source files. Do not introduce a build step (npm, webpack, TypeScript, etc.) unless the user explicitly asks for one.

## Running / testing the extension

There are no CLI commands. To manually verify changes:
1. Open `chrome://extensions`, enable Developer Mode, and "Load unpacked" pointing at this directory (or click "Reload" on the extension if already loaded).
2. Click the extension icon, paste a Gemini API key into the popup, and click "Save Key".
3. Visit any page and check the console (content script logs `text:`/`response:` pairs per element scanned) or DevTools > Service Worker console for `background.js` errors.

## Architecture

Three isolated contexts communicate via `chrome.runtime` messaging and `chrome.storage.local` — there is no shared module system:

- **`popup.js`/`popup.html`** — Settings UI with two independent sections:
  - API key: reads/writes `chrome.storage.local.geminiApiKey`. This is the only place the key is set.
  - Allowed Websites: lets the user add/remove match patterns in `chrome.storage.local.allowedUrls` (a plain domain like `example.com` is normalized to `*://example.com/*` via `toMatchPattern`), or click "Add This Website" to add the active tab's root domain automatically via `chrome.tabs.query` (requires the `activeTab` permission; `www.` is stripped from the hostname). This list — not the manifest — controls which sites `content.js` actually runs on.
- **`content.js`** — Not statically declared in `manifest.json`; instead `background.js` registers it dynamically (see below) only for the user's allowed sites. On page `load`, and again (debounced, via `scroll` + a `MutationObserver` on `document.body`, to catch lazy-loaded/infinite-scroll content) afterwards, `scanPage()` grabs unprocessed `p`/`h1`/`h2`/`h3` elements (tracked in a `WeakSet` so nothing is re-scanned) up to 50 per batch, and for each one sends a `{action: "checkText", text}` message to the background script. If the response has `isNegative: true`, it blurs the element (`filter: blur(5px)`) and adds a one-time click listener to reveal it.
- **`background.js`** — MV3 service worker with two responsibilities:
  1. **Dynamic content-script registration**: `syncContentScripts()` reads `allowedUrls` from storage and calls `chrome.scripting.registerContentScripts`/`unregisterContentScripts` to (re)inject `content.js` only into those site patterns. It runs on `onInstalled`, `onStartup`, and whenever `chrome.storage.onChanged` fires for `allowedUrls` — so any popup edit takes effect without reloading the extension. Requires the `scripting` permission in `manifest.json`.
  2. **Classification**: listens for `checkText` messages (`classifyText()`) and calls the Gemini **Interactions API** (`POST /v1beta/interactions`, not `generateContent`) to classify text as negative/useless/engagement-bait. Before calling the API it checks a **result cache**: `chrome.storage.local["textCache_" + sha256(text)]` (hashed via `crypto.subtle.digest`, see `hashText()`). A cache hit returns `isNegative` straight from storage with no network call — this is what saves API credit across page reloads, repeated boilerplate text, and other tabs/sites, since the cache is keyed purely by text content, not by page. On a cache miss, it proceeds to the Interactions API and writes the result to that same cache key on success. To avoid re-sending the full ruleset on every (uncached) call, it also caches the returned interaction `id` in `chrome.storage.local.interactionId`: the first call per chain sends `CLASSIFICATION_INSTRUCTIONS` + the text as `input`; every subsequent call sends only the text plus `previous_interaction_id` set to the last cached id (and the chain advances to each new response's `id`, not the original). If a stored id gets rejected (e.g. expired), it's cleared so the next call starts a fresh chain. Structured output is enforced via `response_format` — note this is Gemini's own schema shape (`{type: "object", properties: {...}}`) directly, **not** the OpenAI-style `{type: "json_schema", json_schema: {...}}` wrapper (the API rejects that with a 400). Replies with `{isNegative}` or `{error}`; uses `return true` to keep the async message channel open.

Key implications when touching classification:
- The `interactionId` chain is global (one chain for the whole browser session across all sites/tabs), so context grows unboundedly over a long session — there's no periodic reset.
- The `textCache_*` entries never expire or get evicted — there's no TTL or size cap, so storage grows indefinitely with unique text seen. Fine at small scale; revisit if `chrome.storage.local`'s ~5MB quota becomes a concern.
- Concurrent scans can race: if the same text is in-flight from multiple elements at once, the cache won't have been written yet, so more than one API call can go out for the same text before it's cached. There's no in-flight request de-duplication.
- The JSON shape parsed from the response (`parsed.isNegative`) must stay in sync with `RESPONSE_FORMAT`'s schema in `background.js`.
- The Interactions API is new; field/response shapes here were sourced from docs, not fully verified against a live key — if Google changes the shape, check `response.ok` failures in the service worker console first.

Manifest permissions: `storage`, `scripting` (for dynamic content-script registration), and `host_permissions: ["<all_urls>"]` (needed so the dynamic registration can target whatever site the user adds, and for outbound fetch to `generativelanguage.googleapis.com`).

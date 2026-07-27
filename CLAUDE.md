# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome Extension (Manifest V3) called "Gemini Positivity Filter". It scans text on any web page and, preferring Chrome's on-device `LanguageModel` (Gemini Nano) when available and falling back to the Gemini cloud API otherwise, detects negative/toxic/low-value content and removes matching elements from the page. The popup UI is now Gemini Nano-first: it has no field to enter a Gemini API key (that section was removed), only buttons that open `chrome://flags` to enable on-device Gemini Nano plus a live status readout. The cloud-API fallback path in `lib/classifier.js` still exists in code but has no UI to populate `chrome.storage.local.geminiApiKey`, so in practice it only works if that key was set some other way (e.g. manually via the service worker console).

There is no build system, package manager, bundler, linter, or test suite — the extension runs directly from raw source files. `background.js` and `popup.js` are loaded as native ES modules (`"type": "module"` in the manifest / `<script type="module">`), so code is split into `lib/`/`popup/` files via plain `import`/`export` with no bundler involved. Do not introduce a build step (npm, webpack, TypeScript, etc.) unless the user explicitly asks for one.

## Running / testing the extension

There are no CLI commands. To manually verify changes:
1. Open `chrome://extensions`, enable Developer Mode, and "Load unpacked" pointing at this directory (or click "Reload" on the extension if already loaded).
2. Click the extension icon. Under "1. AI Setup", use the two buttons to open `chrome://flags` and enable the Optimization Guide (BypassPerfRequirement) and Prompt API flags, then fully restart Chrome — the popup's status line (`checkNanoStatus()` in `popup.js`) reports whether `window.LanguageModel` is detected and ready.
3. Under "2. Active Websites", add a site (or click "Add Current Tab") — this list, stored in `chrome.storage.local.allowedUrls`, controls where `content.js` is dynamically injected.
4. Visit an allowed page and check the console (content script logs `elementsToCheck`/`nanoSession`/`text:`/`response:`) or DevTools > Service Worker console for `background.js` errors.

## Architecture

```
manifest.json
background.js              entry point: wires chrome.runtime/storage listeners
lib/
  classifier.js             classifyText() — Gemini Interactions API + result cache
  contentScriptSync.js      syncContentScripts() — dynamic content-script (un)registration
content.js                  classic (non-module) content script, injected dynamically
popup.html
popup.js                    entry point: initializes allowed-sites UI + on-device Nano status check on DOMContentLoaded
popup/
  allowedSites.js            initAllowedSites() + toMatchPattern() — allowed-sites list UI
```

Three isolated JS contexts communicate only via `chrome.runtime` messaging and `chrome.storage.local` — `background.js` and `popup.js` are each a thin entry point importing from their own module files; `content.js` stays a single classic script (dynamically-registered content scripts don't support `type: "module"`, so it isn't split further):

- **`popup.js` + `popup/*`** — Settings UI. `popup.js` itself (not split into `popup/*`) wires the "AI Setup" section directly on `DOMContentLoaded`: two buttons open `chrome://flags` pages (`#optimization-guide-on-device-model`, `#prompt-api-for-gemini-nano`) via `chrome.tabs.create`, and `checkNanoStatus()` probes `window.LanguageModel` (falling back to the older `window.canCreateTextSession()`) to show a ✅/⚠️ readiness readout. There is no API-key input anywhere in the popup — `popup/apiKeySettings.js` was removed; `chrome.storage.local.geminiApiKey` now has no UI writer.
  - `allowedSites.js`: lets the user add/remove match patterns in `chrome.storage.local.allowedUrls` (a plain domain like `example.com` is normalized to `*://example.com/*` via `toMatchPattern`), or click "Add Current Tab" to add the active tab's root domain automatically via `chrome.tabs.query` (requires the `activeTab` permission; `www.` is stripped from the hostname). This list — not the manifest — controls which sites `content.js` actually runs on (`manifest.json` has no static `content_scripts` entry).
- **`content.js`** — On page `load`, and again (debounced, via `scroll` + a `MutationObserver` on `document.body`, to catch lazy-loaded/infinite-scroll content) afterwards, `scanPage()` grabs unprocessed `p`/`h1`/`h2`/`h3`/`span`/`a` elements (tracked in a `WeakSet` so nothing is re-scanned) up to 50 per batch, and creates at most one on-device `window.LanguageModel` session per batch (if `availability() === 'available'`) shared across all elements in it. For each element, it first resolves the container to actually act on (`[role="article"]`, `article`, `.post`, `.tweet`, `.card`, `.feed-item`, `li`, or a fallback `div`/`section`/parent), skips it if already flagged (`dataset.positivityBlurred`) or mid-check (`dataset.positivityChecking`) by an earlier element in the same container, then applies a visible loading state — `blur(4px)` plus an absolutely-positioned "⏳ Checking..." spinner (injecting a one-time `#positivity-spinner-style` keyframes rule) — while classification runs. It prompts the shared Nano session directly in-page if available; otherwise it falls back to a promise-wrapped `chrome.runtime.sendMessage({action: "checkText", text})` to the background script. Either path funnels into `handleNegative()`, which sets `dataset.positivityBlurred` and **removes the container from the DOM outright**; if not negative, `cleanupLoading()` removes the spinner and restores the container's original `filter`/`position` inline styles.
- **`background.js` + `lib/*`** — MV3 module service worker with two responsibilities:
  1. **`lib/contentScriptSync.js`**: `syncContentScripts()` reads `allowedUrls` from storage and calls `chrome.scripting.registerContentScripts`/`unregisterContentScripts` to (re)inject `content.js` only into those site patterns. `background.js` runs it on `onInstalled`, `onStartup`, and whenever `chrome.storage.onChanged` fires for `allowedUrls` — so any popup edit takes effect without reloading the extension. Requires the `scripting` permission in `manifest.json`.
  2. **`lib/classifier.js`**: `classifyText()` is called from `background.js`'s `checkText` message listener (used as the Gemini API fallback path when on-device `LanguageModel` isn't available in the page) and calls the Gemini **Interactions API** (`POST /v1beta/interactions`, not `generateContent`) to classify text as negative/useless/engagement-bait. Before calling the API it checks a **result cache**: `chrome.storage.local["textCache_" + sha256(text)]` (hashed via `crypto.subtle.digest`, see `hashText()`). A cache hit returns `isNegative` straight from storage with no network call — this is what saves API credit across page reloads, repeated boilerplate text, and other tabs/sites, since the cache is keyed purely by text content, not by page. On a cache miss, it proceeds to the Interactions API and writes the result to that same cache key on success. To avoid re-sending the full ruleset on every (uncached) call, it also caches the returned interaction `id` in `chrome.storage.local.interactionId`: the first call per chain sends `CLASSIFICATION_INSTRUCTIONS` + the text as `input`; every subsequent call sends only the text plus `previous_interaction_id` set to the last cached id (and the chain advances to each new response's `id`, not the original). If a stored id gets rejected (e.g. expired), it's cleared so the next call starts a fresh chain. Structured output is enforced via `response_format` (`RESPONSE_FORMAT`, defined in `lib/classifier.js`) — note this is Gemini's own schema shape (`{type: "object", properties: {...}}`) directly, **not** the OpenAI-style `{type: "json_schema", json_schema: {...}}` wrapper (the API rejects that with a 400). The response body is parsed defensively via `extractOutputText()`, which tries several plausible field paths for the model's text output and returns `{error: "Unrecognized Gemini response shape."}` instead of throwing if none match. Replies with `{isNegative}` or `{error}`.

Key implications when touching classification:
- The `interactionId` chain is global (one chain for the whole browser session across all sites/tabs), so context grows unboundedly over a long session — there's no periodic reset.
- The `textCache_*` entries never expire or get evicted — there's no TTL or size cap, so storage grows indefinitely with unique text seen. Fine at small scale; revisit if `chrome.storage.local`'s ~5MB quota becomes a concern.
- Concurrent scans can race: if the same text is in-flight from multiple elements at once, the cache won't have been written yet, so more than one API call can go out for the same text before it's cached. There's no in-flight request de-duplication.
- The JSON shape parsed from the response (`parsed.isNegative`) must stay in sync with `RESPONSE_FORMAT`'s schema in `lib/classifier.js`.
- The Interactions API is new; field/response shapes here were sourced from docs, not fully verified against a live key — if Google changes the shape, check `response.ok` failures in the service worker console first.
- The cloud-API path only fires when on-device Nano is unavailable, and only succeeds if `chrome.storage.local.geminiApiKey` is already set — but the popup no longer has any UI to set it (see "What this is" above). In practice this whole `lib/classifier.js` code path is currently unreachable/unusable through normal popup use.

Manifest permissions: `storage`, `scripting` (for dynamic content-script registration), `activeTab` (for popup's "Add Current Tab" button, see `allowedSites.js` above), and `host_permissions: ["<all_urls>"]` (needed so the dynamic registration can target whatever site the user adds, and for outbound fetch to `generativelanguage.googleapis.com`).

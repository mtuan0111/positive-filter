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

- **`popup.js`/`popup.html`** — Settings UI. Reads/writes the user's Gemini API key to `chrome.storage.local` under the key `geminiApiKey`. This is the only place the key is set.
- **`content.js`** — Injected into every page (`<all_urls>`). On page `load`, `scanPage()` grabs the first 50 `p`/`h1`/`h2`/`h3` elements with text length >= 20, and for each one sends a `{action: "checkText", text}` message to the background script. If the response has `isNegative: true`, it blurs the element (`filter: blur(5px)`) and adds a one-time click listener to reveal it.
- **`background.js`** — MV3 service worker. Listens for `checkText` messages, reads the stored API key, and calls the Gemini API (`gemini-2.5-flash:generateContent`) with a prompt asking it to classify the text as negative/useless via forced JSON output (`response_mime_type: "application/json"`), then replies with `{isNegative}` or `{error}`. Uses `return true` in the listener to keep the async message channel open.

Key implication when changing the classification logic: the JSON shape the background script parses (`parsed.isNegative`) must stay in sync with the shape requested in the Gemini prompt — the prompt currently only describes the criteria in prose and expects the model to emit `isNegative` in its JSON response, so prompt edits and response-parsing edits need to change together.

Manifest permissions are minimal: `storage` and `host_permissions: ["<all_urls>"]` (needed for the content script and outbound fetch to `generativelanguage.googleapis.com`).

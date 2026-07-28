# Gemini Positivity Filter

A privacy-first Chrome Extension that uses Chrome's built-in on-device AI (Gemini Nano) to scan text on web pages and filter out negative, toxic, or low-value content in real time. Because it runs 100% locally on your machine, your reading data never leaves your device.

![Gemini Positivity Filter Logo](asset/posstive-filter-png.png)

## Features

- **100% Private & Offline**: Uses Gemini Nano (Chrome's local AI model). No data is sent to the cloud.
- **Dynamic Content Filtering**: Automatically scans and removes toxic content, clickbait, and engagement-bait as you scroll.
- **Custom AI Rules**: Define exactly what "negative" means to you using your own custom prompt rules.
- **Targeted Activation**: Only runs on the specific websites you choose, preserving performance on other sites — a handful of common social sites (Facebook, X/Twitter, Instagram, Quora, TikTok) are pre-added by default on install, and you can add/remove sites freely.
- **Visual Feedback**: Shows a pulsing blur overlay while content is being analyzed, a quick "✅ Safe" badge when something checks out clean, and a smooth collapse animation when negative content is removed.
- **Blocked Content Log**: Keeps a running count and recent history of what's been filtered out, viewable (and clearable) right in the popup.

## Installation

This extension is currently installed manually via Chrome Developer Mode.

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Turn on **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the folder containing this repository's files.
6. The extension should now appear in your list of installed extensions. Pin it to your toolbar for easy access!

## How to Use

### 1. Enable Chrome's Built-in AI (Gemini Nano)

For the extension to work locally, you must enable Chrome's experimental AI features. 

1. Click on the extension icon in your toolbar to open the popup.
2. Under the **1. AI Setup** section, click the two buttons to open the required Chrome flags:
   - **Optimization Guide**: Set to `Enabled BypassPerfRequirement`
   - **Prompt API**: Set to `Enabled`
3. **IMPORTANT:** Completely close all Chrome windows and restart the browser for the flags to take effect.
4. Open the extension popup again. You should see a green success message: "Gemini Nano is ready to use!" (Note: Chrome may take a few minutes to download the Nano model in the background if this is your first time enabling it).

### 2. Add Active Websites

To save system resources, the filter only runs on websites you explicitly allow.

1. Navigate to a website where you want to filter negativity (e.g., a news site or social media feed).
2. Open the extension popup and click **Add Current Tab** under the **2. Active Websites** section.
3. Alternatively, you can type a domain manually (e.g., `x.com`) and click **Add**.
4. Adding a domain automatically covers all its subdomains too (e.g. adding `facebook.com` also matches `m.facebook.com`, `www.facebook.com`, etc.), so you don't need to add each one separately.

### 3. Customize Your Rules (Optional)

You can tell the AI exactly what to look for.

1. In the extension popup, go to **3. Custom AI Rules**.
2. Type in your custom criteria (e.g., "Filter out any posts about politics or natural disasters").
3. Click **Save Prompt**. The AI will now use your custom rules to evaluate content on your active websites. (Saving or resetting the prompt also clears previously cached results, since old verdicts were made under the old rules.)

### 4. Review Blocked Content

Every time the filter removes something, it's logged for you to review.

1. Open the extension popup and scroll to **4. Blocked Content**.
2. See a running count and a list of recently filtered items (with timestamp and site).
3. Click **Clear Log** to reset the count and history.

## Privacy Policy

*Last updated: 2026-07-28*

**Summary: This extension does not collect, transmit, or sell your data to us or any third party. Analysis of page content happens on your own device by default, and everything the extension stores stays in your browser's local storage.**

### What data is processed, and where

- **Page text scanning**: When you visit a site you've added to the allowed list, the extension reads the visible text of `p`, `h1`–`h3`, `span`, `a`, and a few site-specific feed elements on that page in order to classify it as negative/toxic/low-value or not.
- **On-device by default**: If Chrome's built-in Gemini Nano model is available on your machine, that text is analyzed **entirely locally** via Chrome's `LanguageModel` API. It never leaves your device for this path.
- **Cloud fallback (only if you configure it)**: If on-device Gemini Nano isn't available, the code falls back to Google's Gemini API (`generativelanguage.googleapis.com`), which would send the scanned text to Google's servers for classification. This path requires a Gemini API key to be present in the extension's storage; the current popup UI has no way to enter one, so in practice this fallback does not run for most users. If you are a developer and set an API key yourself, be aware that page text would then be sent to Google under [Google's own privacy policy](https://policies.google.com/privacy) and [Gemini API terms](https://ai.google.dev/gemini-api/terms).
- We (the extension's developer) do not run any server. There is no analytics, telemetry, crash reporting, or tracking of any kind built into the extension, and no data is ever sent to us.

### What's stored, and where

Everything the extension keeps is stored in `chrome.storage.local` — your browser's local storage for this extension, on your device only:

- **Your settings**: the list of allowed websites, your custom filtering prompt (if you set one).
- **Classification cache**: hashes (SHA-256) of previously-seen text mapped to a true/false negativity result, so identical text isn't re-analyzed. The cache stores a hash and a boolean, not the original text.
- **Blocked content log**: a short (up to 100 characters), truncated excerpt of text that was flagged, along with a timestamp and the domain it was found on — kept only so you can review what the filter has removed, capped at the 50 most recent entries, and clearable anytime from the popup.
- **Gemini API key**, only if a developer has manually added one for the cloud fallback described above.

None of this storage is synced to any account or server — it lives only in your local Chrome profile and is deleted if you remove the extension.

### Permissions this extension requests, and why

- **`storage`**: to save your settings and caches locally, as described above.
- **`scripting`**: to inject the content-filtering script only into the specific sites you've added to your allowed list.
- **`activeTab`**: to let the "Add Current Tab" button read the current tab's domain when you click it.
- **Host permission on all sites (`<all_urls>`)**: required so the extension *can* register its content script on whatever site you choose to add — it does not scan any site you haven't explicitly allowed.

### Your choices

- You control exactly which websites the filter runs on, and can add or remove sites anytime.
- You can clear the blocked-content log at any time from the popup.
- Uninstalling the extension removes all locally stored data along with it.

### Changes to this policy

If the data this extension processes or stores changes in a future version, this section will be updated to reflect it — check the "Last updated" date above.

## Architecture & Development

For developers looking to understand the codebase or contribute, please see the [CLAUDE.md](CLAUDE.md) file for a detailed architectural breakdown of the service worker, content scripts, and classification logic.

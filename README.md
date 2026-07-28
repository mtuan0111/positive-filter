# Gemini Positivity Filter

A privacy-first Chrome Extension that uses Chrome's built-in on-device AI (Gemini Nano) to scan text on web pages and filter out negative, toxic, or low-value content in real time. Because it runs 100% locally on your machine, your reading data never leaves your device.

![Gemini Positivity Filter Logo](asset/posstive-filter-png.png)

## Features

- **100% Private & Offline**: Uses Gemini Nano (Chrome's local AI model). No data is sent to the cloud.
- **Dynamic Content Filtering**: Automatically scans and removes toxic content, clickbait, and engagement-bait as you scroll.
- **Custom AI Rules**: Define exactly what "negative" means to you using your own custom prompt rules.
- **Targeted Activation**: Only runs on the specific websites you choose, preserving performance on other sites.
- **Visual Feedback**: Shows a loading overlay and a subtle blur while content is being analyzed.

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
3. Alternatively, you can type a domain manually (e.g., `twitter.com`) and click **Add**.

### 3. Customize Your Rules (Optional)

You can tell the AI exactly what to look for.

1. In the extension popup, go to **3. Custom AI Rules**.
2. Type in your custom criteria (e.g., "Filter out any posts about politics or natural disasters").
3. Click **Save Prompt**. The AI will now use your custom rules to evaluate content on your active websites.

## Architecture & Development

For developers looking to understand the codebase or contribute, please see the [CLAUDE.md](CLAUDE.md) file for a detailed architectural breakdown of the service worker, content scripts, and classification logic.

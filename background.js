import { classifyText } from './lib/classifier.js';
import { syncContentScripts } from './lib/contentScriptSync.js';

const DEFAULT_SITES = [
  "*://*.facebook.com/*",
  "*://*.x.com/*",
  "*://*.twitter.com/*",
  "*://*.instagram.com/*",
  "*://*.quora.com/*",
  "*://*.tiktok.com/*"
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['allowedUrls'], (result) => {
    if (result.allowedUrls === undefined) {
      chrome.storage.local.set({ allowedUrls: DEFAULT_SITES }, syncContentScripts);
    } else {
      syncContentScripts();
    }
  });
});
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.allowedUrls) syncContentScripts();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkText") {
    classifyText(request.text).then((response) => {
      // If the content script's tab was closed/reloaded before this finished,
      // sendResponse will fail and set lastError. We check it to prevent an
      // "Unchecked runtime.lastError" (Context Unknown) in the extension dashboard.
      sendResponse(response);
      const _ = chrome.runtime.lastError;
    });
    return true; // Keeps the message channel open for the async response
  }
});

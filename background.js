import { classifyText } from './lib/classifier.js';
import { syncContentScripts } from './lib/contentScriptSync.js';

chrome.runtime.onInstalled.addListener(syncContentScripts);
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

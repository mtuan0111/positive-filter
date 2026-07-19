import { classifyText } from './lib/classifier.js';
import { syncContentScripts } from './lib/contentScriptSync.js';

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.allowedUrls) syncContentScripts();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkText") {
    classifyText(request.text).then(sendResponse);
    return true; // Keeps the message channel open for the async response
  }
});

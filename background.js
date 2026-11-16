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

const REPORT_MENU_ID = "scrollclean-report-toxic";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: REPORT_MENU_ID,
      title: "Report as toxic (ScrollClean)",
      contexts: ["page", "selection", "link", "image"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== REPORT_MENU_ID || !tab?.id) return;
  // Pages where the content script isn't running have no receiver; ignore that error.
  chrome.tabs.sendMessage(tab.id, { action: "reportToxic" }, () => {
    const _ = chrome.runtime.lastError;
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['allowedUrls'], (result) => {
    if (result.allowedUrls === undefined) {
      chrome.storage.local.set({ allowedUrls: DEFAULT_SITES }, syncContentScripts);
    } else {
      // Migrate old patterns without subdomain wildcard
      // e.g. *://facebook.com/* → *://*.facebook.com/*
      const migrated = result.allowedUrls.map(url => {
        const match = url.match(/^\*:\/\/([^*.][^/]+)\/\*$/);
        if (match) return `*://*.${match[1]}/*`;
        return url;
      });
      const changed = migrated.some((u, i) => u !== result.allowedUrls[i]);
      if (changed) {
        chrome.storage.local.set({ allowedUrls: migrated }, syncContentScripts);
      } else {
        syncContentScripts();
      }
    }
  });
});
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.allowedUrls || changes.allSitesEnabled)) syncContentScripts();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "report-toxic") return;
  const send = (tabId) => chrome.tabs.sendMessage(tabId, { action: "reportToxic" }, () => {
    const _ = chrome.runtime.lastError;
  });
  if (tab?.id) send(tab.id);
  else chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => t?.id && send(t.id));
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getReportShortcut") {
    chrome.commands.getAll((commands) => {
      const cmd = commands.find((c) => c.name === "report-toxic");
      sendResponse({ shortcut: cmd?.shortcut || "" });
    });
    return true;
  }
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

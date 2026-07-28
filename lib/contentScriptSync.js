// content.js is no longer statically declared in manifest.json (which would run it on
// <all_urls>). Instead it's registered dynamically for whatever site patterns the user
// saves in the popup, so the filter only runs on the sites they've opted in.
const CONTENT_SCRIPT_ID = "positivity-filter";

let syncPromise = null;

export function syncContentScripts() {
  if (syncPromise) {
    syncPromise = syncPromise.then(doSync);
  } else {
    syncPromise = doSync().finally(() => { syncPromise = null; });
  }
  return syncPromise;
}

async function doSync() {
  const { allowedUrls = [] } = await chrome.storage.local.get(['allowedUrls']);

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  }

  if (allowedUrls.length === 0) return;

  await chrome.scripting.registerContentScripts([{
    id: CONTENT_SCRIPT_ID,
    matches: allowedUrls,
    js: ["content.js"],
    runAt: "document_idle"
  }]);
}

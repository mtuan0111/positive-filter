// The classification rules only need to be sent once. On the first call we send
// them together with the text; every call after that reuses the cached
// interaction_id so the model still has the rules in context and we only pay for
// the new text, per https://ai.google.dev/gemini-api/docs/interactions-overview.
const CLASSIFICATION_INSTRUCTIONS = `Analyze the following text. Does it contain information that makes the reader feel bad/negative, OR is it considered "useless information" / manipulative engagement-bait?
Evaluate as TRUE if the text meets ANY of the following criteria:
1. Negative/Bad Feelings: The content is toxic, distressing, depressing, fear-mongering, or designed to make the reader feel upset, angry, or anxious.
2. Useless Information: The content is "trash news", clickbait, petty gossip, sensationalized trivial matters, or uses manipulative tactics like withholding information just to force a click.
3. Engagement-Bait Structure: The text is structurally engineered to farm clicks/comments/shares rather than to inform, e.g. it shows several of:
   - An extreme/absolute hook line, a shocking number, or a dangling question up front.
   - A "curiosity gap" that deliberately withholds the core information until the end or behind "read more" / "see more".
   - Choppy pacing: very short sentences and frequent line breaks written for fast scrolling rather than readability.
   - Trigger words like "secret", "truth", "warning", "shocking", "you won't believe", "don't miss this" (including equivalents in other languages, e.g. Vietnamese "bí mật", "sự thật", "cảnh báo", "kinh hoàng", "không ngờ", "đừng bỏ lỡ").
   - An unresolved/incomplete story clearly meant to provoke comments or follows, or an extreme one-sided opinion meant to provoke outrage or arguing.
   - Heavy use of attention-grabbing emoji (e.g. 🚨 🛑 😱 👇) used to break up lines rather than convey meaning.
For every message that follows, apply these same rules to whatever text is given, even though the rules aren't restated.`;

const RESPONSE_FORMAT = {
  type: "object",
  properties: { isNegative: { type: "boolean" } },
  required: ["isNegative"]
};

// Classification results are cached by a hash of the exact text, so identical text
// seen again -- a page reload, the same boilerplate on another page, another tab --
// is served from storage instead of spending another API call.
const CACHE_KEY_PREFIX = "textCache_";

async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// content.js is no longer statically declared in manifest.json (which would run it on
// <all_urls>). Instead it's registered dynamically for whatever site patterns the user
// saves in the popup, so the filter only runs on the sites they've opted in.
const CONTENT_SCRIPT_ID = "positivity-filter";

async function syncContentScripts() {
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

chrome.runtime.onInstalled.addListener(syncContentScripts);
chrome.runtime.onStartup.addListener(syncContentScripts);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.allowedUrls) syncContentScripts();
});

async function classifyText(textToCheck) {
  const cacheKey = CACHE_KEY_PREFIX + await hashText(textToCheck);
  const stored = await chrome.storage.local.get(['geminiApiKey', 'interactionId', cacheKey]);

  if (stored[cacheKey] !== undefined) {
    return { isNegative: stored[cacheKey] };
  }

  if (!stored.geminiApiKey) {
    return { error: "No API key found." };
  }

  const apiKey = stored.geminiApiKey;
  const previousInteractionId = stored.interactionId;

  // No cached interaction yet: send the full ruleset plus the text. Once cached,
  // only the text needs to go out; the rules stay in context via previous_interaction_id.
  const input = previousInteractionId
    ? `Text: "${textToCheck}"`
    : `${CLASSIFICATION_INSTRUCTIONS}\nText: "${textToCheck}"`;

  const body = {
    model: "gemini-2.5-flash",
    input,
    response_format: RESPONSE_FORMAT
  };
  if (previousInteractionId) body.previous_interaction_id = previousInteractionId;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      // The cached interaction may have expired or been invalidated server-side;
      // drop it so the next call starts a fresh chain instead of failing forever.
      if (previousInteractionId) chrome.storage.local.remove('interactionId');
      return { error: data.error?.message || "Gemini API request failed." };
    }

    // Chain forward from this interaction (not the original one) so context keeps building.
    chrome.storage.local.set({ interactionId: data.id });

    const modelOutput = data.steps.find(step => step.type === "model_output");
    const rawText = modelOutput.content[0].text;
    const parsed = JSON.parse(rawText);

    chrome.storage.local.set({ [cacheKey]: parsed.isNegative });

    return { isNegative: parsed.isNegative };
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { error: "Failed to fetch from Gemini." };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkText") {
    classifyText(request.text).then(sendResponse);
    return true; // Keeps the message channel open for the async response
  }
});

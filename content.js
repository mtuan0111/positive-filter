// Elements we've already sent to the background script, so re-scans triggered by
// scrolling/lazy-loaded content don't re-check the same text repeatedly.
const processedElements = new WeakSet();
const CACHE_KEY_PREFIX = "nanoCache_";

async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Finds the feed item / post / article to act on for a given element.
function findContainer(el) {
  let target = el.closest(
    '[role="article"], article, .post, .tweet, .card, .feed-item, li, ' +
    // Quora bundles
    '[class*="dom_annotate_multifeed_bundle"]'
  );
  if (!target) {
    // Fallback: get the closest major container, or just the parent
    target = el.closest('div, section') || el.parentElement || el;
  }
  return target;
}

// Marks a container as blocked and animates it collapsed before removing it.
function collapseAndRemove(target) {
  target.dataset.positivityBlurred = "true";

  target.style.transition = 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
  target.style.overflow = 'hidden';
  target.style.height = target.offsetHeight + 'px';

  // Force reflow
  target.offsetHeight;

  target.style.height = '0px';
  target.style.paddingTop = '0px';
  target.style.paddingBottom = '0px';
  target.style.marginTop = '0px';
  target.style.marginBottom = '0px';
  target.style.opacity = '0';
  target.style.border = 'none';

  setTimeout(() => {
    target.remove();
  }, 400);
}

// A simple function to scan paragraphs. In a real app, you'd want to optimize this
// so you don't hit API rate limits by scanning hundreds of elements at once.
async function scanPage() {
  // Once the extension is reloaded/updated (common during development), this page's
  // content script is orphaned -- chrome.runtime is torn down and calling into it
  // throws "Extension context invalidated". Bail out rather than crash on every scan.
  if (!chrome.runtime?.id) return;

  const { filterEnabled } = await chrome.storage.local.get(['filterEnabled']);
  if (filterEnabled === false) return;

  const paragraphs = document.querySelectorAll(
    // Standard semantic tags
    'p, h1, h2, h3, span, a, ' +
    // Facebook
    '[role="article"], [data-ad-comet-rendering-mode], div[dir="auto"], ' +
    // Quora feed items and text blocks
    '[class*="dom_annotate_multifeed_bundle"], .puppeteer_test_tribe_post_item_feed_story, ' +
    '.qu-wordBreak--break-word'
  );

  // Only look at elements we haven't already processed, and cap the batch size
  // to save API calls when a lot of new content loads at once.
  const elementsToCheck = Array.from(paragraphs)
    .filter(el => !processedElements.has(el) && el.innerText && el.innerText.trim().length >= 20)
    .slice(0, 50);

  if (elementsToCheck.length === 0) return;

  const newlyBlocked = [];

  const { customPrompt } = await chrome.storage.local.get(['customPrompt']);
  const basePrompt = customPrompt || `Analyze the following text. Act as an expert Trust and Safety Content Moderator. Analyze the following text and determine if it contains any harmful elements.

Look specifically for:
1. Toxicity: Insults, hate speech, harassment, profanity, or aggressive tone.
2. Distressing Content: Violence, self-harm references, or extreme negativity/doomscrolling material.
3. Clickbait: Sensationalized language, exaggerated claims, or intentionally withholding key information to force a click.
4. Manipulative Engagement-Bait: Guilt-tripping, fear-mongering, forced sharing (e.g., 'share if you care'), or false urgency.`;

  let nanoSession = null;
  try {
    if (window.LanguageModel) {
      const availability = await window.LanguageModel.availability()
      if (availability === 'available') {
        nanoSession = await window.LanguageModel.create();
      }
    }
  } catch (e) {
    console.warn("Nano AI initialization failed:", e);
  }

  for (let el of elementsToCheck) {
    processedElements.add(el);

    const text = el.innerText.trim();
    if (text.length < 20) continue; // Skip very short text

    // Find a suitable container to blur (like a feed item, article, or post)
    const target = findContainer(el);

    if (target.dataset.positivityBlurred || target.dataset.positivityChecking) continue;

    // Apply loading state
    target.dataset.positivityChecking = "true";
    const originalPosition = target.style.position;

    if (window.getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    // overlay.style.backdropFilter = 'blur(8px)';
    // overlay.style.WebkitBackdropFilter = 'blur(8px)';
    // overlay.style.backgroundColor = 'var(--pf-overlay-bg, rgba(230, 230, 230, 0.4))';
    // overlay.style.zIndex = '999998';
    // overlay.style.pointerEvents = 'none';
    // overlay.style.transition = 'all 0.3s ease';
    // overlay.style.animation = 'positivity-pulse 1.5s ease-in-out infinite';

    const spinner = document.createElement('div');
    const iconUrl = chrome.runtime.getURL("asset/watermarked_img_8969727160137344162.png");
    spinner.innerHTML = `<img src="${iconUrl}" style="width: 16px; height: 16px; border-radius: 4px;"> Cleaning <span style="display:inline-block; width:10px; height:10px; border:2px solid #243552; border-top-color:#3cc8e8; border-radius:50%; animation: spin 0.8s linear infinite;"></span>`;
    spinner.style.position = 'absolute';
    spinner.style.display = 'flex';
    spinner.style.alignItems = 'center';
    spinner.style.gap = '6px';
    spinner.style.top = '10px';
    spinner.style.left = '10px';
    spinner.style.zIndex = '999999';
    spinner.style.background = '#0b1426';
    spinner.style.color = '#e6edf7';
    spinner.style.border = '1px solid #243552';
    spinner.style.padding = '4px 8px';
    spinner.style.borderRadius = '6px';
    spinner.style.fontSize = '12px';
    spinner.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    spinner.style.fontWeight = '600';
    spinner.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';

    // Add keyframes for the spinner and skeleton if not already added
    if (!document.getElementById('positivity-animation-style')) {
      const style = document.createElement('style');
      style.id = 'positivity-animation-style';
      style.textContent = `
        :root {
          --pf-primary: #1a73e8;
          --pf-primary-hover: #1557b0;
          --pf-primary-light: #e8f0fe;
          --pf-bg: #ffffff;
          --pf-bg-secondary: #f8f9fa;
          --pf-bg-tertiary: #f1f3f4;
          --pf-border: #dddddd;
          --pf-text: #333333;
          --pf-text-secondary: #555555;
          --pf-text-tertiary: #666666;
          --pf-text-muted: #999999;
          --pf-warning: #e65100;
          --pf-warning-bg: #fff3e0;
          --pf-success: #0f9d58;
          --pf-success-dark: #155724;
          --pf-success-bg: #d4edda;
          --pf-overlay-bg: rgba(230, 230, 230, 0.4);
          --pf-overlay-success-bg: rgba(200, 255, 200, 0.2);
          --pf-spinner-bg: rgba(255, 255, 255, 0.9);
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes positivity-pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `;
      document.head.appendChild(style);
    }

    overlay.appendChild(spinner);
    target.appendChild(overlay);

    const handleNegative = () => {
      collapseAndRemove(target);

      newlyBlocked.push({
        text: text.length > 100 ? text.substring(0, 100) + "..." : text,
        timestamp: Date.now(),
        domain: window.location.hostname
      });
    };

    const cleanupLoading = (isSafe = false) => {
      if (isSafe && overlay.parentNode) {
        // Remove blur and background immediately with transition
        overlay.style.animation = 'none';
        overlay.style.backdropFilter = 'none';
        overlay.style.WebkitBackdropFilter = 'none';
        overlay.style.backgroundColor = 'transparent';

        spinner.innerHTML = '<span style="font-size: 12px;">✓ Clean</span>';
        spinner.style.color = '#4cc9a0';
        spinner.style.background = '#0f2a27';
        spinner.style.borderColor = '#4cc9a0';

        setTimeout(() => {
          if (overlay.parentNode) overlay.remove();
          if (!target.dataset.positivityBlurred) {
            target.style.position = originalPosition;
          }
          delete target.dataset.positivityChecking;
        }, 2000);
      } else {
        if (overlay.parentNode) overlay.remove();
        if (!target.dataset.positivityBlurred) {
          target.style.position = originalPosition;
        }
        delete target.dataset.positivityChecking;
      }
    };

    let handledByNano = false;
    let isNegativeResult = false;
    let wasCached = false;

    const cacheKey = CACHE_KEY_PREFIX + await hashText(text);
    const cached = await chrome.storage.local.get([cacheKey]);

    if (cached[cacheKey] !== undefined) {
      isNegativeResult = cached[cacheKey];
      wasCached = true;
      handledByNano = true;
    } else if (nanoSession) {
      try {
        const response = await nanoSession.prompt(
          `You are a content filtering assistant. ${basePrompt}\n\nReply ONLY with "true" if the text violates the criteria, or "false" otherwise. Do not explain.\nText:\n\`\`\`${text}\`\`\``
        );

        isNegativeResult = response.toLowerCase().includes("true");
        handledByNano = true;
      } catch (error) {
        console.error("Error executing Nano prompt:", error);
      }
    }

    if (!handledByNano) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "checkText", text: text }, (res) => {
            if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
            else resolve(res);
          });
        });

        if (response && response.isNegative !== undefined) {
          isNegativeResult = response.isNegative;
        }
      } catch (e) {
        cleanupLoading(false);
        break; // context invalidated
      }
    }

    if (!wasCached && (handledByNano || isNegativeResult !== false)) {
      chrome.storage.local.set({ [cacheKey]: isNegativeResult });
    }

    if (isNegativeResult) {
      handleNegative();
      cleanupLoading(false);
    } else {
      cleanupLoading(true);
    }
  }

  if (nanoSession) {
    nanoSession.destroy();
  }

  if (newlyBlocked.length > 0) {
    chrome.storage.local.get(['blockedCount', 'blockedLog'], (result) => {
      const newCount = (result.blockedCount || 0) + newlyBlocked.length;
      let newLog = newlyBlocked.concat(result.blockedLog || []);
      if (newLog.length > 50) newLog = newLog.slice(0, 50);
      chrome.storage.local.set({ blockedCount: newCount, blockedLog: newLog });
    });
  }
}

// Avoid firing scanPage on every single scroll/mutation event; wait until things
// settle for a bit (e.g. after a burst of lazy-loaded content finishes inserting).
function debounce(fn, delayMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  };
}

const debouncedScanPage = debounce(scanPage, 500);

// Run the scan when the page loads
window.addEventListener('load', scanPage);

// Infinite-scroll / lazy-load pages typically fetch and insert new content once the
// user scrolls near the bottom, so re-scan on scroll.
window.addEventListener('scroll', debouncedScanPage, { passive: true });

// Some lazy-load implementations insert content without a scroll event firing at the
// right time (e.g. IntersectionObserver-driven loads), so also watch the DOM directly.
const lazyLoadObserver = new MutationObserver(debouncedScanPage);
lazyLoadObserver.observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------------
// Right-click "Report as toxic": summarize the content into a general rule with
// Nano, append it (with source host + time) to the custom prompt, and hide it.
// ---------------------------------------------------------------------------
const DEFAULT_PROMPT_TEXT = `Analyze the following text. Act as an expert Trust and Safety Content Moderator. Analyze the following text and determine if it contains any harmful elements.

Look specifically for:
1. Toxicity: Insults, hate speech, harassment, profanity, or aggressive tone.
2. Distressing Content: Violence, self-harm references, or extreme negativity/doomscrolling material.
3. Clickbait: Sensationalized language, exaggerated claims, or intentionally withholding key information to force a click.
4. Manipulative Engagement-Bait: Guilt-tripping, fear-mongering, forced sharing (e.g., 'share if you care'), or false urgency.`;

let lastContextTarget = null;
document.addEventListener('contextmenu', (e) => {
  lastContextTarget = e.target instanceof Element ? e.target : null;
}, true);

function formatReportTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(message, undoFn) {
  const old = document.getElementById('scrollclean-toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.id = 'scrollclean-toast';
  toast.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:10px;' +
    'background:#0b1426;color:#e6edf7;border:1px solid #243552;border-left:3px solid #3cc8e8;border-radius:6px;' +
    'padding:8px 12px;font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
    'box-shadow:0 2px 8px rgba(0,0,0,0.35);';
  const label = document.createElement('span');
  label.textContent = message;
  toast.appendChild(label);

  if (undoFn) {
    const undo = document.createElement('button');
    undo.textContent = 'Undo';
    undo.style.cssText = 'background:none;border:none;color:#3cc8e8;font:inherit;cursor:pointer;padding:0;';
    undo.addEventListener('click', async () => {
      await undoFn();
      toast.remove();
    });
    toast.appendChild(undo);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 8000);
}

async function clearResultCaches() {
  const items = await chrome.storage.local.get(null);
  const keys = Object.keys(items).filter(k => k.startsWith('nanoCache_') || k.startsWith('textCache_'));
  if (keys.length) await chrome.storage.local.remove(keys);
}

async function summarizeToRule(text) {
  if (!window.LanguageModel) return null;
  const availability = await window.LanguageModel.availability();
  if (availability !== 'available') return null;

  const session = await window.LanguageModel.create();
  try {
    const reply = await session.prompt(
      'You write content-filter rules. Read the text and reply with ONE short sentence describing the TYPE of harmful content it is ' +
      '(for example harassment, fear-mongering, clickbait). Be general. Do not quote the text, name people, or include personal data. ' +
      'If it is not harmful, reply NONE.\n\nText:\n```' + text + '```'
    );
    return reply;
  } finally {
    session.destroy();
  }
}

function sanitizeRule(raw) {
  if (!raw) return null;
  let rule = raw.split('\n')[0].replace(/[`"]/g, '').trim();
  if (!rule || /^none\b/i.test(rule)) return null;
  rule = rule.replace(/\.+$/, '');
  if (rule.length > 150) rule = rule.slice(0, 150).trim();
  return rule;
}

async function handleReportToxic() {
  if (!chrome.runtime?.id) return;

  const selection = window.getSelection().toString().trim();
  // Prefer the selection's own element (works for the button and the keyboard shortcut,
  // where there was no right-click); fall back to the last right-clicked element.
  let target = lastContextTarget;
  if (selection) {
    const node = window.getSelection().anchorNode;
    const el = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
    if (el) target = el;
  }
  hideReportButton();
  const container = target ? findContainer(target) : null;

  let text = selection || (container && container.innerText ? container.innerText.trim() : '');
  if (!text) {
    showToast('Nothing to report here');
    return;
  }
  text = text.slice(0, 1000);

  let rule;
  try {
    rule = sanitizeRule(await summarizeToRule(text));
    if (rule === null && !(window.LanguageModel && (await window.LanguageModel.availability()) === 'available')) {
      showToast('Chrome AI is not ready');
      return;
    }
  } catch (e) {
    console.warn('Report: Nano failed', e);
    showToast('Chrome AI is not ready');
    return;
  }

  if (!rule) {
    showToast("Doesn't look toxic");
    return;
  }

  const { customPrompt } = await chrome.storage.local.get(['customPrompt']);
  const base = customPrompt || DEFAULT_PROMPT_TEXT;
  const ruleLine = `Also treat as negative: ${rule}.`;

  let appended = null;
  if (!base.includes(ruleLine)) {
    appended = `\n\n${ruleLine}\n(Reported from ${window.location.hostname} on ${formatReportTime()})`;
    await chrome.storage.local.set({ customPrompt: base + appended });
    await clearResultCaches();
  }

  // Hide the reported content right away and log it like any other blocked item.
  const blockTarget = container || target;
  if (blockTarget && blockTarget !== document.body && blockTarget !== document.documentElement) {
    collapseAndRemove(blockTarget);
  }
  const entry = {
    text: text.length > 100 ? text.substring(0, 100) + '...' : text,
    timestamp: Date.now(),
    domain: window.location.hostname
  };
  const { blockedCount = 0, blockedLog = [] } = await chrome.storage.local.get(['blockedCount', 'blockedLog']);
  await chrome.storage.local.set({ blockedCount: blockedCount + 1, blockedLog: [entry, ...blockedLog].slice(0, 50) });

  showToast('Reported. Rule added.', appended ? async () => {
    const { customPrompt: current } = await chrome.storage.local.get(['customPrompt']);
    if (current && current.includes(appended)) {
      await chrome.storage.local.set({ customPrompt: current.replace(appended, '') });
      await clearResultCaches();
    }
  } : null);
}

chrome.runtime.onMessage.addListener((request) => {
  if (request && request.action === 'reportToxic') handleReportToxic();
});


// ---------------------------------------------------------------------------
// Floating "Report" button shown beside selected text (setting: showReportButton).
// Lives in a shadow root so page CSS can't affect it.
// ---------------------------------------------------------------------------
let reportButtonHost = null;
let reportShortcut = null; // fetched once from background (reflects user remaps on next page load)

function getReportShortcut() {
  if (reportShortcut !== null) return Promise.resolve(reportShortcut);
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ action: 'getReportShortcut' }, (res) => {
        const _ = chrome.runtime.lastError;
        reportShortcut = (res && res.shortcut) || '';
        resolve(reportShortcut);
      });
    } catch (e) {
      resolve('');
    }
  });
}

function buildReportButton(shortcut) {
  const host = document.createElement('div');
  host.id = 'scrollclean-report-btn';
  host.style.cssText = 'position:absolute;z-index:2147483647;top:0;left:0;';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      button {
        all: initial;
        display: inline-flex; align-items: center; gap: 6px;
        background: #0b1426; color: #e6edf7;
        border: 1px solid #243552; border-radius: 6px;
        padding: 5px 9px; cursor: pointer;
        font: 600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      }
      button:hover { border-color: #3cc8e8; }
      svg { width: 13px; height: 13px; color: #3cc8e8; }
      kbd {
        font: 500 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: #8b9bb5; border: 1px solid #243552; border-radius: 3px; padding: 0 4px;
      }
    </style>
    <button type="button" title="Report selection as toxic">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>
      <span>Report</span>
      ${shortcut ? `<kbd>${shortcut.replace(/</g, '')}</kbd>` : ''}
    </button>`;
  const btn = root.querySelector('button');
  // Keep the text selection alive when the button is pressed.
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => handleReportToxic());
  return host;
}

function hideReportButton() {
  if (reportButtonHost) {
    reportButtonHost.remove();
    reportButtonHost = null;
  }
}

async function updateReportButton() {
  if (!chrome.runtime?.id) return;
  const sel = window.getSelection();
  const text = sel ? sel.toString().trim() : '';
  if (!sel || sel.rangeCount === 0 || text.length < 3) {
    hideReportButton();
    return;
  }

  // Skip text being edited (inputs, textareas, contenteditable).
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement);
  if (anchor && (anchor.closest('input, textarea, [contenteditable=""], [contenteditable="true"]') ||
      anchor.closest('#scrollclean-toast'))) {
    hideReportButton();
    return;
  }

  const { showReportButton } = await chrome.storage.local.get(['showReportButton']);
  if (showReportButton === false) {
    hideReportButton();
    return;
  }

  const rects = sel.getRangeAt(0).getClientRects();
  if (!rects.length) return;
  const last = rects[rects.length - 1];

  const shortcut = await getReportShortcut();
  if (!reportButtonHost) {
    reportButtonHost = buildReportButton(shortcut);
    document.body.appendChild(reportButtonHost);
  }

  // Absolute page coordinates, placed just after the end of the selection.
  const hostWidth = reportButtonHost.offsetWidth || 130;
  let left = last.right + window.scrollX + 8;
  const maxLeft = window.scrollX + document.documentElement.clientWidth - hostWidth - 8;
  if (left > maxLeft) left = Math.max(window.scrollX + 8, maxLeft);
  const top = last.top + window.scrollY - 4;
  reportButtonHost.style.left = left + 'px';
  reportButtonHost.style.top = top + 'px';
}

// Capture phase so sites that stop propagation of mouse/key events can't swallow them.
function scheduleReportButtonUpdate() {
  setTimeout(() => updateReportButton().catch((e) => console.warn('ScrollClean report button:', e)), 0);
}
document.addEventListener('mouseup', scheduleReportButtonUpdate, true);
document.addEventListener('keyup', (e) => {
  if (e.key === 'Shift' || (e.key && e.key.startsWith('Arrow'))) scheduleReportButtonUpdate();
}, true);
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) hideReportButton();
});
document.addEventListener('mousedown', (e) => {
  if (reportButtonHost && !e.composedPath().includes(reportButtonHost)) hideReportButton();
}, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.showReportButton && changes.showReportButton.newValue === false) hideReportButton();
});

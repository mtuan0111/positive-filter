// Elements we've already sent to the background script, so re-scans triggered by
// scrolling/lazy-loaded content don't re-check the same text repeatedly.
const processedElements = new WeakSet();
const CACHE_KEY_PREFIX = "nanoCache_";

async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// A simple function to scan paragraphs. In a real app, you'd want to optimize this
// so you don't hit API rate limits by scanning hundreds of elements at once.
async function scanPage() {
  // Once the extension is reloaded/updated (common during development), this page's
  // content script is orphaned -- chrome.runtime is torn down and calling into it
  // throws "Extension context invalidated". Bail out rather than crash on every scan.
  if (!chrome.runtime?.id) return;

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
      const availability = await window.LanguageModel.availability();
      console.log("availability: ", availability);
      if (availability === 'available') {
        nanoSession = await window.LanguageModel.create();
      }
    }
  } catch (e) {
    console.warn("Nano AI initialization failed:", e);
  }

  for (let el of elementsToCheck) {
    console.log("check", el);
    processedElements.add(el);

    const text = el.innerText.trim();
    if (text.length < 20) continue; // Skip very short text

    // Find a suitable container to blur (like a feed item, article, or post)
    let target = el.closest(
      '[role="article"], article, .post, .tweet, .card, .feed-item, li, ' +
      // Quora bundles
      '[class*="dom_annotate_multifeed_bundle"]'
    );
    if (!target) {
      // Fallback: get the closest major container, or just the parent
      target = el.closest('div, section') || el.parentElement || el;
    }

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
    overlay.style.backdropFilter = 'blur(8px)';
    overlay.style.WebkitBackdropFilter = 'blur(8px)';
    overlay.style.backgroundColor = 'var(--pf-overlay-bg, rgba(230, 230, 230, 0.4))';
    overlay.style.zIndex = '999998';
    overlay.style.pointerEvents = 'none';
    overlay.style.transition = 'all 0.3s ease';
    overlay.style.animation = 'positivity-pulse 1.5s ease-in-out infinite';

    const spinner = document.createElement('div');
    const iconUrl = chrome.runtime.getURL("asset/posstive-filter-png.png");
    spinner.innerHTML = `<img src="${iconUrl}" style="width: 16px; height: 16px; border-radius: 3px;"> <span style="display:inline-block; animation: spin 1s linear infinite;">⏳</span> Checking...`;
    spinner.style.position = 'absolute';
    spinner.style.display = 'flex';
    spinner.style.alignItems = 'center';
    spinner.style.gap = '6px';
    spinner.style.top = '10px';
    spinner.style.left = '10px';
    spinner.style.zIndex = '999999';
    spinner.style.background = 'var(--pf-spinner-bg, rgba(255, 255, 255, 0.9))';
    spinner.style.color = 'var(--pf-text, #333)';
    spinner.style.padding = '4px 8px';
    spinner.style.borderRadius = '4px';
    spinner.style.fontSize = '14px';
    spinner.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    spinner.style.fontWeight = 'bold';
    spinner.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

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
        
        spinner.innerHTML = '<span style="font-size: 14px;">✅</span> Safe';
        spinner.style.color = 'var(--pf-success-dark, #155724)';
        spinner.style.background = 'var(--pf-success-bg, #d4edda)';
        
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
        console.log("text to analyze: ", text);
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
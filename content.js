// Elements we've already sent to the background script, so re-scans triggered by
// scrolling/lazy-loaded content don't re-check the same text repeatedly.
const processedElements = new WeakSet();

// A simple function to scan paragraphs. In a real app, you'd want to optimize this
// so you don't hit API rate limits by scanning hundreds of elements at once.
async function scanPage() {


  // Once the extension is reloaded/updated (common during development), this page's
  // content script is orphaned -- chrome.runtime is torn down and calling into it
  // throws "Extension context invalidated". Bail out rather than crash on every scan.
  if (!chrome.runtime?.id) return;

  const paragraphs = document.querySelectorAll('p, h1, h2, h3, span, a');

  // Only look at elements we haven't already processed, and cap the batch size
  // to save API calls when a lot of new content loads at once.
  const elementsToCheck = Array.from(paragraphs)
    .filter(el => !processedElements.has(el))
    .slice(0, 50);

  if (elementsToCheck.length === 0) return;

  const { customPrompt } = await chrome.storage.local.get(['customPrompt']);
  const basePrompt = customPrompt || "Analyze the following text. Is it toxic, distressing, clickbait, or manipulative engagement-bait?";

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
    let target = el.closest('[role="article"], article,  .post, .tweet, .card, .feed-item, li');
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
    overlay.style.backdropFilter = 'blur(5px)';
    overlay.style.WebkitBackdropFilter = 'blur(5px)';
    overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    overlay.style.zIndex = '999998';
    overlay.style.pointerEvents = 'none';

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
    spinner.style.background = 'rgba(255, 255, 255, 0.9)';
    spinner.style.color = '#333';
    spinner.style.padding = '4px 8px';
    spinner.style.borderRadius = '4px';
    spinner.style.fontSize = '12px';
    spinner.style.fontWeight = 'bold';
    spinner.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

    // Add keyframes for the spinner if not already added
    if (!document.getElementById('positivity-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'positivity-spinner-style';
      style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }

    overlay.appendChild(spinner);
    target.appendChild(overlay);

    const handleNegative = () => {
      target.dataset.positivityBlurred = "true";
      target.remove();
    };

    const cleanupLoading = () => {
      if (overlay.parentNode) overlay.remove();
      if (!target.dataset.positivityBlurred) {
        target.style.position = originalPosition;
      }
      delete target.dataset.positivityChecking;
    };

    let handledByNano = false;
    console.log("nanoSession: ", nanoSession);
    if (nanoSession) {
      try {
        console.log("text to analyze: ", text);
        const response = await nanoSession.prompt(
          `You are a content filtering assistant. ${basePrompt}\n\nReply ONLY with "true" if the text violates the criteria, or "false" otherwise. Do not explain.\nText:\n\`\`\`${text}\`\`\``
        );

        if (response.toLowerCase().includes("true")) {
          handleNegative();
        }
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

        if (response && response.isNegative) {
          handleNegative();
        }
      } catch (e) {
        cleanupLoading();
        break; // context invalidated
      }
    }

    cleanupLoading();
  }

  if (nanoSession) {
    nanoSession.destroy();
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
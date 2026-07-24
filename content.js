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

  console.log("elementsToCheck: ", elementsToCheck);

  if (elementsToCheck.length === 0) return;

  let nanoSession = null;
  try {
    if (window.LanguageModel) {
      const availability = await window.LanguageModel.availability();
      console.log("availability: ", availability);
      if (availability === 'available') {
        nanoSession = await window.LanguageModel.create(
          //   {
          //   systemPrompt: 'Analyze the following text. Is it toxic, distressing, clickbait, or manipulative engagement-bait? Reply only with "true" if it is negative/useless, or "false" otherwise.'
          // }
        );
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

    const handleNegative = () => {
      // Find a suitable container to blur (like a feed item, article, or post)
      let target = el.closest('[role="article"], article,  .post, .tweet, .card, .feed-item, li');
      if (!target) {
        // Fallback: get the closest major container, or just the parent
        target = el.closest('div, section') || el.parentElement || el;
      }
      else {
        target.remove();
        return;
      }

      // Prevent attaching multiple listeners if another element inside the same wrapper is also flagged
      if (target.dataset.positivityBlurred) return;
      target.dataset.positivityBlurred = "true";

      target.remove();
      return;

      target.style.filter = "blur(8px)";
      target.style.cursor = "pointer";
      target.title = "Flagged as negative. Click to reveal.";
      target.style.transition = "filter 0.3s ease"; // Smooth reveal

      target.addEventListener('click', function reveal(e) {
        e.preventDefault(); // Prevent accidental navigation on the reveal click
        e.stopPropagation();
        target.style.filter = "none";
        target.title = "";
        target.removeEventListener('click', reveal, { capture: true });
      }, { capture: true });
    };

    let handledByNano = false;
    console.log("nanoSession: ", nanoSession);
    if (nanoSession) {
      try {
        console.log("text to analyze: ", text);
        const response = await nanoSession.prompt(
          "Analyze the following text. Is it toxic, distressing, clickbait, or manipulative engagement-bait? Reply only with \"true\" if it is negative/useless, or \"false\" otherwise."
          + "\n"
          + "```" + text + "```"

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
        chrome.runtime.sendMessage({ action: "checkText", text: text }, (response) => {
          if (chrome.runtime.lastError) return; // context invalidated mid-flight; ignore

          console.log("text: ", text);
          console.log("response: ", response);
          if (response && response.isNegative) {
            handleNegative();
          }
        });
      } catch {
        break; // context invalidated (extension reloaded); stop scanning for this page
      }
    }
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
// Elements we've already sent to the background script, so re-scans triggered by
// scrolling/lazy-loaded content don't re-check the same text repeatedly.
const processedElements = new WeakSet();

// A simple function to scan paragraphs. In a real app, you'd want to optimize this
// so you don't hit API rate limits by scanning hundreds of elements at once.
async function scanPage() {

    const paragraphs = document.querySelectorAll('p, h1, h2, h3, span, a');

    // Only look at elements we haven't already processed, and cap the batch size
    // to save API calls when a lot of new content loads at once.
    const elementsToCheck = Array.from(paragraphs)
      .filter(el => !processedElements.has(el))
      .slice(0, 50);

    for (let el of elementsToCheck) {
      processedElements.add(el);

      const text = el.innerText.trim();
      if (text.length < 20) continue; // Skip very short text

      chrome.runtime.sendMessage({ action: "checkText", text: text }, (response) => {
        console.log("text: ", text);
        console.log("response: ", response);
        if (response && response.isNegative) {
          // Blur the negative content and add a click-to-reveal feature
          el.style.filter = "blur(5px)";
          el.style.cursor = "pointer";
          el.title = "Flagged as negative. Click to reveal.";

          el.addEventListener('click', function reveal() {
            el.style.filter = "none";
            el.title = "";
            el.removeEventListener('click', reveal);
          });
        }
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
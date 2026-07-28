// Converts plain domains ("example.com") into a match pattern, or passes an
// already-valid match pattern (e.g. "*://*.example.com/*") through as-is.
export function toMatchPattern(raw) {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;

  if (/^(\*|https?):\/\//.test(value)) {
    return value.includes('/', value.indexOf('://') + 3) ? value : `${value}/*`;
  }

  return `*://${value.replace(/^\/+/, '')}/*`;
}

export function initAllowedSites() {
  const urlInput = document.getElementById('urlInput');
  const addUrlBtn = document.getElementById('addUrlBtn');
  const addCurrentBtn = document.getElementById('addCurrentBtn');
  const urlList = document.getElementById('urlList');
  const urlStatus = document.getElementById('urlStatus');

  function showUrlStatus(message) {
    urlStatus.textContent = message;
    setTimeout(() => urlStatus.textContent = "", 2000);
  }

  function renderUrls(urls) {
    urlList.textContent = '';
    urls.forEach((pattern) => {
      const li = document.createElement('li');

      const label = document.createElement('span');
      label.textContent = pattern;

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        chrome.storage.local.get(['allowedUrls'], (result) => {
          const remaining = (result.allowedUrls || []).filter((p) => p !== pattern);
          chrome.storage.local.set({ allowedUrls: remaining }, () => renderUrls(remaining));
        });
      });

      li.appendChild(label);
      li.appendChild(removeBtn);
      urlList.appendChild(li);
    });
  }

  const DEFAULT_SITES = [
    "*://facebook.com/*",
    "*://x.com/*",
    "*://instagram.com/*",
    "*://quora.com/*",
    "*://tiktok.com/*"
  ];

  chrome.storage.local.get(['allowedUrls'], (result) => {
    if (result.allowedUrls === undefined) {
      chrome.storage.local.set({ allowedUrls: DEFAULT_SITES }, () => renderUrls(DEFAULT_SITES));
    } else {
      renderUrls(result.allowedUrls);
    }
  });

  function savePattern(pattern) {
    chrome.storage.local.get(['allowedUrls'], (result) => {
      const urls = result.allowedUrls || [];
      if (urls.includes(pattern)) {
        showUrlStatus("Already added.");
        return;
      }

      const updated = [...urls, pattern];
      chrome.storage.local.set({ allowedUrls: updated }, () => renderUrls(updated));
    });
  }

  function addUrl() {
    const pattern = toMatchPattern(urlInput.value);
    if (!pattern) {
      showUrlStatus("Enter a valid domain or match pattern.");
      return;
    }

    savePattern(pattern);
    urlInput.value = '';
  }

  // Grabs the root domain of the active tab (stripping "www.") and adds it directly,
  // so the user doesn't have to type/copy the domain themselves.
  function addCurrentSite() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url) {
        showUrlStatus("Couldn't read the current tab.");
        return;
      }

      let hostname;
      try {
        hostname = new URL(tab.url).hostname;
      } catch {
        hostname = null;
      }

      if (!hostname) {
        showUrlStatus("This page can't be added.");
        return;
      }

      const rootDomain = hostname.replace(/^www\./, '');
      savePattern(`*://${rootDomain}/*`);
    });
  }

  addUrlBtn.addEventListener('click', addUrl);
  addCurrentBtn.addEventListener('click', addCurrentSite);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addUrl();
  });
}

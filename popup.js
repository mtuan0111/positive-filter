import { initAllowedSites } from './popup/allowedSites.js';

document.addEventListener('DOMContentLoaded', () => {
  initAllowedSites();
  checkNanoStatus();

  document.getElementById('flagOptimizationBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://flags/#optimization-guide-on-device-model' });
  });

  document.getElementById('flagPromptApiBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://flags/#prompt-api-for-gemini-nano' });
  });

  initCustomPrompt();
});

const DEFAULT_PROMPT = "Analyze the following text. Is it toxic, distressing, clickbait, or manipulative engagement-bait?";

function initCustomPrompt() {
  const promptInput = document.getElementById('promptInput');
  const saveBtn = document.getElementById('savePromptBtn');
  const resetBtn = document.getElementById('resetPromptBtn');
  const statusEl = document.getElementById('promptStatus');

  // Load existing
  chrome.storage.local.get(['customPrompt'], (result) => {
    promptInput.value = result.customPrompt || DEFAULT_PROMPT;
  });

  saveBtn.addEventListener('click', () => {
    const val = promptInput.value.trim() || DEFAULT_PROMPT;
    chrome.storage.local.set({ customPrompt: val }, () => {
      statusEl.style.display = 'block';
      setTimeout(() => statusEl.style.display = 'none', 2000);
    });
  });

  resetBtn.addEventListener('click', () => {
    promptInput.value = DEFAULT_PROMPT;
    chrome.storage.local.set({ customPrompt: DEFAULT_PROMPT });
  });
}

async function checkNanoStatus() {
  const promptIcon = document.getElementById('promptIcon');
  const optIcon = document.getElementById('optIcon');
  const statusEl = document.getElementById('nanoStatus');

  try {
    if (window.LanguageModel) {
      promptIcon.textContent = '✅';

      let isReady = 'no';
      if (typeof window.LanguageModel.availability === 'function') {
        const availability = await window.LanguageModel.availability();
        isReady = availability;
      } else if (typeof window.canCreateTextSession === 'function') {
        isReady = await window.canCreateTextSession();
      }

      if (isReady === 'available' || isReady === 'readily' || isReady === 'after-download') {
        optIcon.textContent = '✅';
        statusEl.textContent = 'Gemini Nano is ready to use!';
        statusEl.style.color = 'green';
      } else {
        optIcon.textContent = '⚠️';
        statusEl.textContent = 'Optimization Guide is not ready yet. Please ensure it is set to "Enabled BypassPerfRequirement". If you just enabled it, Chrome may still be downloading the model.';
        statusEl.style.color = 'orange';
      }
    } else {
      promptIcon.textContent = '⚠️';
      optIcon.textContent = '⚠️';
      statusEl.textContent = 'Prompt API is not detected. Please ensure it is set to "Enabled" and restart Chrome.';
      statusEl.style.color = 'red';
    }
  } catch (e) {
    optIcon.textContent = '⚠️';
    statusEl.textContent = `Error checking status: ${e.message}`;
    statusEl.style.color = 'red';
    console.error(e);
  }
}

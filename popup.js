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

  document.getElementById('relaunchChromeBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://restart' });
  });
});

async function checkNanoStatus() {
  const promptIcon = document.getElementById('promptIcon');
  const optIcon = document.getElementById('optIcon');
  const statusEl = document.getElementById('nanoStatus');

  try {
    if (window.ai) {
      promptIcon.textContent = '✅';
      
      let isReady = 'no';
      if (window.ai.languageModel && typeof window.ai.languageModel.capabilities === 'function') {
        const capabilities = await window.ai.languageModel.capabilities();
        isReady = capabilities.available;
      } else if (typeof window.ai.canCreateTextSession === 'function') {
        isReady = await window.ai.canCreateTextSession();
      }
      
      if (isReady === 'readily' || isReady === 'after-download') {
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

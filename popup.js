import { initAllowedSites } from './popup/allowedSites.js';

document.addEventListener('DOMContentLoaded', () => {
  initAllowedSites();

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

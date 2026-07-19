import { initApiKeySettings } from './popup/apiKeySettings.js';
import { initAllowedSites } from './popup/allowedSites.js';

document.addEventListener('DOMContentLoaded', () => {
  initApiKeySettings();
  initAllowedSites();
});

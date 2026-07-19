export function initApiKeySettings() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const statusTxt = document.getElementById('status');

  // Load saved key
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
  });

  // Save key
  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      statusTxt.textContent = "API Key saved!";
      setTimeout(() => statusTxt.textContent = "", 2000);
    });
  });
}

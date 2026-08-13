import { initAllowedSites } from './popup/allowedSites.js';

document.addEventListener('DOMContentLoaded', () => {
  initAllowedSites();
  checkNanoStatus();
  initMasterToggle();

  document.getElementById('flagOptimizationBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://flags/#optimization-guide-on-device-model' });
  });

  document.getElementById('flagPromptApiBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://flags/#prompt-api-for-gemini-nano' });
  });

  initCustomPrompt();
  initBlockedLog();
});

function initMasterToggle() {
  const masterToggle = document.getElementById('masterToggle');
  
  // Load existing state, defaulting to true
  chrome.storage.local.get(['filterEnabled'], (result) => {
    masterToggle.checked = result.filterEnabled !== false;
  });

  // Save on change
  masterToggle.addEventListener('change', (e) => {
    chrome.storage.local.set({ filterEnabled: e.target.checked });
  });
}

function initBlockedLog() {
  const countEl = document.getElementById('blockedCount');
  const listEl = document.getElementById('blockedList');
  const clearBtn = document.getElementById('clearLogBtn');

  function renderLog(count, log) {
    countEl.textContent = count || 0;
    
    if (!log || log.length === 0) {
      listEl.innerHTML = '<em style="color: #999;">No content blocked yet.</em>';
      return;
    }

    listEl.innerHTML = '';
    log.forEach(item => {
      const div = document.createElement('div');
      div.style.marginBottom = '8px';
      div.style.paddingBottom = '8px';
      div.style.borderBottom = '1px solid #eee';
      
      const timeStr = new Date(item.timestamp).toLocaleTimeString();
      const domainStr = item.domain ? ` <span style="color: #666; font-size: 10px;">(${item.domain})</span>` : '';
      div.innerHTML = `<strong style="color: #e65100;">${timeStr}</strong>${domainStr} - ${item.text}`;
      listEl.appendChild(div);
    });
  }

  chrome.storage.local.get(['blockedCount', 'blockedLog'], (result) => {
    renderLog(result.blockedCount, result.blockedLog);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.blockedCount || changes.blockedLog)) {
      chrome.storage.local.get(['blockedCount', 'blockedLog'], (result) => {
        renderLog(result.blockedCount, result.blockedLog);
      });
    }
  });

  clearBtn.addEventListener('click', () => {
    chrome.storage.local.set({ blockedCount: 0, blockedLog: [] });
  });
}

const DEFAULT_PROMPT = `Analyze the following text. Act as an expert Trust and Safety Content Moderator. Analyze the following text and determine if it contains any harmful elements.

Look specifically for:
1. Toxicity: Insults, hate speech, harassment, profanity, or aggressive tone.
2. Distressing Content: Violence, self-harm references, or extreme negativity/doomscrolling material.
3. Clickbait: Sensationalized language, exaggerated claims, or intentionally withholding key information to force a click.
4. Manipulative Engagement-Bait: Guilt-tripping, fear-mongering, forced sharing (e.g., 'share if you care'), or false urgency.`;

function initCustomPrompt() {
  const promptInput = document.getElementById('promptInput');
  const saveBtn = document.getElementById('savePromptBtn');
  const resetBtn = document.getElementById('resetPromptBtn');
  const statusEl = document.getElementById('promptStatus');

  // Load existing
  chrome.storage.local.get(['customPrompt'], (result) => {
    promptInput.value = result.customPrompt || DEFAULT_PROMPT;
  });

  function clearCache() {
    chrome.storage.local.get(null, (items) => {
      const cacheKeys = Object.keys(items).filter(k => k.startsWith('nanoCache_') || k.startsWith('textCache_'));
      if (cacheKeys.length > 0) {
        chrome.storage.local.remove(cacheKeys);
      }
    });
  }

  saveBtn.addEventListener('click', async () => {
    const val = promptInput.value.trim() || DEFAULT_PROMPT;

    let nanoSession = null;
    try {
      if (window.LanguageModel) {
        const availability = await window.LanguageModel.availability();
        if (availability === 'available' || availability === 'readily') {
          nanoSession = await window.LanguageModel.create();
        }
      }
    } catch (e) {
      console.warn("Nano AI initialization failed for validation:", e);
    }

    if (nanoSession) {
      saveBtn.disabled = true;
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Verifying...';
      try {
        const verificationPrompt = `Does the following prompt define negative, harmful, or unwanted content to be filtered out? 
Reply ONLY with "valid" if it defines negative/harmful content, or "invalid" if it defines positive content, allows everything, or goes against the goal of filtering out bad content.

Prompt to evaluate:
"""${val}"""`;

        const response = await nanoSession.prompt(verificationPrompt);
        
        if (response.toLowerCase().includes("invalid")) {
          statusEl.textContent = 'Invalid prompt! Must define negative content.';
          statusEl.style.color = 'var(--pf-warning)';
          statusEl.style.display = 'block';
          setTimeout(() => statusEl.style.display = 'none', 4000);
          
          saveBtn.disabled = false;
          saveBtn.textContent = originalText;
          nanoSession.destroy();
          return; // Do not save
        }
      } catch (e) {
        console.error("Prompt verification failed", e);
      }
      nanoSession.destroy();
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }

    chrome.storage.local.set({ customPrompt: val }, () => {
      clearCache();
      statusEl.textContent = 'Saved!';
      statusEl.style.color = 'var(--pf-success)';
      statusEl.style.display = 'block';
      setTimeout(() => statusEl.style.display = 'none', 2000);
    });
  });

  resetBtn.addEventListener('click', () => {
    promptInput.value = DEFAULT_PROMPT;
    chrome.storage.local.set({ customPrompt: DEFAULT_PROMPT }, clearCache);
  });

  const shareBtn = document.getElementById('sharePromptBtn');
  shareBtn.addEventListener('click', () => {
    const val = promptInput.value.trim() || DEFAULT_PROMPT;
    navigator.clipboard.writeText(val).then(() => {
      const originalText = shareBtn.textContent;
      shareBtn.textContent = 'Copied to Clipboard!';
      setTimeout(() => shareBtn.textContent = originalText, 2000);
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  });
}

async function checkNanoStatus() {
  const promptIcon = document.getElementById('promptIcon');
  const optIcon = document.getElementById('optIcon');
  const statusEl = document.getElementById('nanoStatus');
  const restartNote = document.getElementById('restartNote');
  const disableTip = document.getElementById('disableTip');

  const setNotReadyUi = () => {
    restartNote.style.display = 'block';
    disableTip.style.display = 'none';
  };

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
        restartNote.style.display = 'none';
        disableTip.style.display = 'block';
      } else {
        optIcon.textContent = '⚠️';
        statusEl.textContent = 'Optimization Guide is not ready yet. Please ensure it is set to "Enabled BypassPerfRequirement". If you just enabled it, Chrome may still be downloading the model.';
        statusEl.style.color = 'var(--pf-primary)';
        setNotReadyUi();
      }
    } else {
      promptIcon.textContent = '⚠️';
      optIcon.textContent = '⚠️';
      statusEl.textContent = 'Prompt API is not detected. Please ensure it is set to "Enabled" and restart Chrome.';
      statusEl.style.color = 'red';
      setNotReadyUi();
    }
  } catch (e) {
    optIcon.textContent = '⚠️';
    statusEl.textContent = `Error checking status: ${e.message}`;
    statusEl.style.color = 'red';
    setNotReadyUi();
    console.error(e);
  }
}

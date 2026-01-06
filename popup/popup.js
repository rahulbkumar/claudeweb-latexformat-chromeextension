// Claude LaTeX Formatter - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  const autoRenderToggle = document.getElementById('autoRenderToggle');
  const renderBtn = document.getElementById('renderBtn');
  const statusEl = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['autoRender'], (result) => {
    autoRenderToggle.checked = result.autoRender || false;
  });

  // Handle auto-render toggle
  autoRenderToggle.addEventListener('change', () => {
    const enabled = autoRenderToggle.checked;

    // Save setting
    chrome.storage.sync.set({ autoRender: enabled });

    // Send message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes('claude.ai')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'setAutoRender',
          enabled: enabled
        }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Reload page to apply', 'error');
          } else {
            showStatus(enabled ? 'Auto-render enabled' : 'Auto-render disabled', 'success');
          }
        });
      }
    });
  });

  // Handle render button click
  renderBtn.addEventListener('click', () => {
    renderBtn.disabled = true;
    renderBtn.textContent = 'Rendering...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        showStatus('No active tab', 'error');
        resetButton();
        return;
      }

      if (!tabs[0].url.includes('claude.ai')) {
        showStatus('Not on claude.ai', 'error');
        resetButton();
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: 'renderLatex' }, (response) => {
        if (chrome.runtime.lastError) {
          showStatus('Reload page first', 'error');
        } else if (response && response.success) {
          showStatus('LaTeX rendered!', 'success');
        } else {
          showStatus('Rendering failed', 'error');
        }
        resetButton();
      });
    });
  });

  function resetButton() {
    setTimeout(() => {
      renderBtn.disabled = false;
      renderBtn.textContent = 'Render LaTeX Now';
    }, 500);
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;

    setTimeout(() => {
      statusEl.textContent = '';
      statusEl.className = 'status';
    }, 3000);
  }
});

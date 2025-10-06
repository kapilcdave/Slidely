// Popup script
document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const openPanelBtn = document.getElementById('openPanelBtn');
    const statusDiv = document.getElementById('status');
    
    // Load saved API key
    chrome.storage.sync.get(['apiKey'], (result) => {
        if (result.apiKey) {
            apiKeyInput.value = result.apiKey;
        }
    });
    
    // Save API key
    saveBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('Please enter an API key', 'error');
            return;
        }
        
        chrome.storage.sync.set({ apiKey: apiKey }, () => {
            showStatus('Settings saved successfully!', 'success');
            
            // Notify content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'updateApiKey',
                        apiKey: apiKey
                    });
                }
            });
        });
    });
    
    // Open side panel
    openPanelBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            
            // Check if on Google Slides
            if (!tab.url.includes('docs.google.com/presentation')) {
                showStatus('Please open a Google Slides presentation first', 'error');
                return;
            }
            
            chrome.tabs.sendMessage(tab.id, { action: 'openPanel' }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                } else {
                    showStatus('Side panel opened!', 'success');
                    window.close();
                }
            });
        });
    });
    
    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
});

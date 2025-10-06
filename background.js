// Background service worker
chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Slides Assistant installed');
});

// Listen for extension icon clicks
chrome.action.onClicked.addListener((tab) => {
    if (tab.url.includes('docs.google.com/presentation')) {
        chrome.tabs.sendMessage(tab.id, { action: 'openPanel' });
    }
});

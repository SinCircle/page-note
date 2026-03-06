/* PageNote - background */

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  const url = tab?.url || '';
  if (!tabId || !/^https?:\/\//i.test(url)) return;

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'addNote' });
  } catch (_e) {
    // content script 可能尚未注入，忽略
  }
});

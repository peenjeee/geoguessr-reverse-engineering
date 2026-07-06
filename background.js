chrome.action.onClicked.addListener((tab) => {
  const targetTabId = tab?.id || 0;
  const path = targetTabId ? `popup.html?targetTabId=${targetTabId}` : "popup.html";

  if (!chrome.sidePanel) {
    chrome.windows.create({
      url: chrome.runtime.getURL(path),
      type: "popup",
      width: 380,
      height: 650,
      focused: true,
    });
    return;
  }

  chrome.sidePanel.setOptions({ path, enabled: true }, () => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });
});

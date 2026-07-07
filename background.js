function openPopup(path) {
  chrome.windows.create({
    url: chrome.runtime.getURL(path),
    type: "popup",
    width: 380,
    height: 650,
    focused: true,
  });
}

async function showPagePanel(tab, popupPath) {
  if (!tab?.id) {
    openPopup(popupPath);
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["internal.js"],
      world: "MAIN",
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => window.__pnjShowPanel?.(),
    });
  } catch {
    openPopup(popupPath);
  }
}

async function hidePagePanel(tab) {
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => window.__pnjHidePanel?.(),
    });
  } catch {
    // Page cannot be scripted; nothing to hide.
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const targetTabId = tab?.id || 0;
  const popupPath = targetTabId ? `popup.html?targetTabId=${targetTabId}` : "popup.html";

  if (!chrome.sidePanel || !tab?.id) {
    showPagePanel(tab, popupPath);
    return;
  }

  try {
    await chrome.sidePanel.open({ tabId: tab.id });
    await hidePagePanel(tab);
  } catch {
    showPagePanel(tab, popupPath);
  }
});

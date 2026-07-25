const sidePanelTabs = new Set();

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
  } catch { }
}

chrome.action.onClicked.addListener(async (tab) => {
  const targetTabId = tab?.id || 0;
  const popupPath = targetTabId ? `popup.html?targetTabId=${targetTabId}` : "popup.html";
  if (!chrome.sidePanel || !tab?.id) {
    showPagePanel(tab, popupPath);
    return;
  }
  try {
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: "popup.html", enabled: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    sidePanelTabs.add(tab.id);
    await hidePagePanel(tab);
  } catch {
    showPagePanel(tab, popupPath);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "pnj-open-panel") {
    const tabId = sender.tab?.id;
    if (!chrome.sidePanel || !tabId) {
      showPagePanel(sender.tab, tabId ? `popup.html?targetTabId=${tabId}` : "popup.html");
      return;
    }
    if (sidePanelTabs.has(tabId)) {
      if (navigator.userAgent.includes("Edg")) {
        chrome.sidePanel.setOptions({ path: "minimized.html" }).catch(() => {});
        chrome.sidePanel.open({ tabId }).then(() => {
          chrome.sidePanel.setOptions({ path: "popup.html" }).catch(() => {});
        }).catch(() => {
          chrome.sidePanel.setOptions({ path: "popup.html" }).catch(() => {});
        });
      } else {
        chrome.sidePanel.close({ tabId }).catch(() => {});
        chrome.runtime.sendMessage({ type: "pnj-close-panel", tabId }).catch(() => {});
      }
      sidePanelTabs.delete(tabId);
      return;
    }
    chrome.sidePanel.setOptions({ tabId, path: "popup.html", enabled: true });
    chrome.sidePanel.open({ tabId })
      .then(() => { sidePanelTabs.add(tabId); })
      .catch(() => showPagePanel(sender.tab, `popup.html?targetTabId=${tabId}`));
    hidePagePanel(sender.tab);
    return;
  }

  if (message?.type !== "pnj-telemetry" || !message.payload) return;
  const body = JSON.stringify(message.payload);
  ["http://localhost:3000/api/telemetry", "https://gr.0xpnj.dev/api/telemetry"].forEach((url) => {
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  sidePanelTabs.delete(tabId);
});

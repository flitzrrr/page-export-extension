// popup.js

const DEFAULT_BACKEND_URL = "http://localhost:8000";

const btnSingle = document.getElementById("export-single");
const btnWithLinks = document.getElementById("export-with-links");
const statusEl = document.getElementById("status");
const sameOriginCheckbox = document.getElementById("same-origin-only");
const maxPagesInput = document.getElementById("max-pages");

const backendUrlInput = document.getElementById("backend-url");
const targetFolderInput = document.getElementById("target-folder");
const outputFormatSelect = document.getElementById("output-format");
const saveSettingsBtn = document.getElementById("save-settings");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "red" : "inherit";
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        backendUrl: DEFAULT_BACKEND_URL,
        targetFolder: "",
        outputFormat: "markdown",
      },
      resolve
    );
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, resolve);
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

function sanitizeSlug(baseTitle) {
  const safe = (baseTitle || "page").replace(/[^a-z0-9\-]+/gi, "_");
  return safe || "page";
}

async function sendToBackend(html, meta) {
  const settings = await loadSettings();
  const backendUrl = (settings.backendUrl || "").trim();

  if (!backendUrl) {
    setStatus("Backend URL is not configured.", true);
    return;
  }

  const cleanBase = backendUrl.replace(/\/+$/, "");
  const url = cleanBase + "/api/import-html";

  const payload = {
    html,
    url: meta.url || "",
    title: meta.title || "",
    output_format: settings.outputFormat || "markdown",
    target_folder: settings.targetFolder || "",
  };

  setStatus("Sending page to backend…");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Backend error: " + res.status + " " + text);
  }

  const data = await res.json().catch(() => ({}));
  const info = data.saved_markdown || data.saved_html || "";
  if (info) {
    setStatus("Page sent to backend (" + info + ").");
  } else {
    setStatus("Page sent to backend.");
  }
}

async function exportSinglePage() {
  try {
    setStatus(chrome.i18n.getMessage("statusExportingSingle"));

    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      setStatus(chrome.i18n.getMessage("errorNoActiveTab"), true);
      return;
    }

    await ensureContentScript(tab.id);

    chrome.tabs.sendMessage(tab.id, { type: "EXPORT_HTML" }, (response) => {
      if (!response || !response.ok) {
        const msg =
          (response && response.error) ||
          chrome.i18n.getMessage("errorExtractFailed");
        setStatus(msg, true);
        return;
      }

      const baseTitle = sanitizeSlug(response.title || tab.title || "page");

      sendToBackend(response.html, {
        url: response.url || tab.url || "",
        title: baseTitle,
      }).catch((err) => {
        console.error(err);
        setStatus("Unexpected backend error: " + String(err), true);
      });
    });
  } catch (err) {
    console.error(err);
    setStatus(
      chrome.i18n.getMessage("errorUnexpected", [String(err)]),
      true
    );
  }
}

async function exportPageWithLinks() {
  try {
    const sameOriginOnly = sameOriginCheckbox.checked;
    const maxPages = Math.max(
      1,
      Math.min(500, parseInt(maxPagesInput.value || "20", 10))
    );

    setStatus(
      chrome.i18n.getMessage("statusCollectingLinks", [String(maxPages)])
    );

    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      setStatus(chrome.i18n.getMessage("errorNoActiveTab"), true);
      return;
    }

    await ensureContentScript(tab.id);

    chrome.tabs.sendMessage(
      tab.id,
      {
        type: "GET_LINKS",
        sameOriginOnly,
        maxLinks: maxPages - 1,
      },
      async (response) => {
        if (!response || !response.ok) {
          const msg =
            (response && response.error) ||
            chrome.i18n.getMessage("errorCollectLinksFailed");
          setStatus(msg, true);
          return;
        }

        const links = response.links || [];
        const allUrls = [response.baseUrl, ...links];

        setStatus(
          chrome.i18n.getMessage("statusExportingMulti", [
            String(allUrls.length),
          ])
        );

        let index = 0;
        for (const url of allUrls) {
          index += 1;
          setStatus(
            chrome.i18n.getMessage("statusExportingPageNofM", [
              String(index),
              String(allUrls.length),
            ])
          );

          const newTab = await chrome.tabs.create({
            url,
            active: false,
          });

          await new Promise((resolve) => {
            function listener(tabId, info) {
              if (tabId === newTab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
              }
            }
            chrome.tabs.onUpdated.addListener(listener);
          });

          if (!newTab.id) continue;

          await ensureContentScript(newTab.id);

          await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              newTab.id,
              { type: "EXPORT_HTML" },
              (resp) => {
                if (resp && resp.ok) {
                  const baseTitle = sanitizeSlug(
                    resp.title || newTab.title || "page"
                  );

                  sendToBackend(resp.html, {
                    url,
                    title: baseTitle,
                  }).catch((err) => {
                    console.error(err);
                    setStatus(
                      "Unexpected backend error: " + String(err),
                      true
                    );
                  });
                }
                resolve();
              }
            );
          });

          if (newTab.id) {
            chrome.tabs.remove(newTab.id);
          }
        }

        setStatus(
          chrome.i18n.getMessage("statusExportDoneMulti", [
            String(allUrls.length),
          ])
        );
      }
    );
  } catch (err) {
    console.error(err);
    setStatus(
      chrome.i18n.getMessage("errorUnexpected", [String(err)]),
      true
    );
  }
}

btnSingle.addEventListener("click", exportSinglePage);
btnWithLinks.addEventListener("click", exportPageWithLinks);

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const settings = await loadSettings();
    backendUrlInput.value = settings.backendUrl || DEFAULT_BACKEND_URL;
    targetFolderInput.value = settings.targetFolder || "";
    outputFormatSelect.value = settings.outputFormat || "markdown";
  } catch (err) {
    console.error("Failed to load settings", err);
  }
});

saveSettingsBtn.addEventListener("click", async () => {
  try {
    await saveSettings({
      backendUrl: backendUrlInput.value.trim() || DEFAULT_BACKEND_URL,
      targetFolder: targetFolderInput.value.trim(),
      outputFormat: outputFormatSelect.value || "markdown",
    });
    setStatus("Settings saved.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to save settings: " + String(err), true);
  }
});


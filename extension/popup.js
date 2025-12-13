// popup.js

const DEFAULT_BACKEND_URL = "http://localhost:8000";

const btnSingle = document.getElementById("export-single");
const btnWithLinks = document.getElementById("export-with-links");
const statusEl = document.getElementById("status");
const sameOriginCheckbox = document.getElementById("same-origin-only");
const maxPagesInput = document.getElementById("max-pages");
const maxDepthInput = document.getElementById("max-depth");

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
    relative_path: meta.relativePath || "",
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
        relativePath:
          (response.url || tab.url)
            ? new URL(response.url || tab.url).pathname
            : "",
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
    const maxDepth = Math.max(
      1,
      Math.min(10, parseInt(maxDepthInput.value || "1", 10))
    );

    const tab = await getActiveTab();
    if (!tab || !tab.id) {
      setStatus(chrome.i18n.getMessage("errorNoActiveTab"), true);
      return;
    }

    await ensureContentScript(tab.id);

    const startUrl = tab.url || "";
    if (!startUrl) {
      setStatus("Active tab has no URL.", true);
      return;
    }

    const visited = new Set();
    const queue = [];

    const normalizeUrl = (u) => {
      try {
        const parsed = new URL(u);
        parsed.hash = "";
        return parsed.toString();
      } catch {
        return null;
      }
    };

    const rootUrlNorm = normalizeUrl(startUrl);
    if (!rootUrlNorm) {
      setStatus("Failed to parse active tab URL.", true);
      return;
    }

    visited.add(rootUrlNorm);
    queue.push({ url: rootUrlNorm, depth: 0, tabId: tab.id, isRoot: true });

    let processed = 0;

    setStatus(
      chrome.i18n.getMessage("statusExportingMulti", [String(maxPages)])
    );

    while (queue.length && processed < maxPages) {
      const current = queue.shift();
      const { url, depth, isRoot } = current;

      let currentTabId = current.tabId;

      if (!currentTabId) {
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

        currentTabId = newTab.id;
      }

      if (!currentTabId) continue;

      await ensureContentScript(currentTabId);

      setStatus(
        chrome.i18n.getMessage("statusExportingPageNofM", [
          String(processed + 1),
          String(maxPages),
        ])
      );

      const exportResponse = await new Promise((resolve) => {
        chrome.tabs.sendMessage(
          currentTabId,
          { type: "EXPORT_HTML" },
          (resp) => resolve(resp)
        );
      });

      if (exportResponse && exportResponse.ok) {
        const baseTitle = sanitizeSlug(
          exportResponse.title || "page"
        );

        try {
          const urlForPath = exportResponse.url || url;
          const relPath = urlForPath ? new URL(urlForPath).pathname : "";

          await sendToBackend(exportResponse.html, {
            url: urlForPath,
            title: baseTitle,
            relativePath: relPath,
          });
        } catch (err) {
          console.error(err);
          setStatus("Unexpected backend error: " + String(err), true);
        }
      }

      processed += 1;

      // Collect further links if we have not reached max depth yet
      if (depth < maxDepth - 1 && processed < maxPages) {
        const linksResponse = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            currentTabId,
            {
              type: "GET_LINKS",
              sameOriginOnly,
              maxLinks: maxPages,
            },
            (resp) => resolve(resp)
          );
        });

        if (linksResponse && linksResponse.ok) {
          const links = linksResponse.links || [];
          for (const rawUrl of links) {
            const norm = normalizeUrl(rawUrl);
            if (!norm) continue;
            if (visited.has(norm)) continue;
            visited.add(norm);
            queue.push({
              url: norm,
              depth: depth + 1,
              tabId: null,
              isRoot: false,
            });
            if (queue.length + processed >= maxPages) {
              break;
            }
          }
        }
      }

      // Close non-root tabs to keep the browser tidy
      if (!isRoot && currentTabId) {
        chrome.tabs.remove(currentTabId);
      }
    }

    setStatus(
      chrome.i18n.getMessage("statusExportDoneMulti", [String(processed)])
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
    // Localized UI labels
    if (chrome.i18n) {
      const t = (key, fallback) =>
        chrome.i18n.getMessage(key) || fallback;

      btnSingle.textContent = t(
        "btnExportSingle",
        "Export current page HTML"
      );
      btnWithLinks.textContent = t(
        "btnExportWithLinks",
        "Export page + internal links"
      );

      const sameOriginLabel = document.getElementById("label-same-origin");
      const maxPagesLabel = document.getElementById("label-max-pages");
      if (sameOriginLabel) {
        sameOriginLabel.textContent = t(
          "labelSameOrigin",
          "Only same-origin links"
        );
      }
      if (maxPagesLabel) {
        maxPagesLabel.textContent = t(
          "labelMaxPages",
          "Max. pages (including this one):"
        );
      }
    }

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

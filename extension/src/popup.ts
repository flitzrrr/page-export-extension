export {};

const DEFAULT_BACKEND_URL = "http://localhost:8000";

declare global {
  interface Window {
    __popupInit?: () => void;
  }
}

type Settings = {
  backendUrl: string;
  targetFolder: string;
  outputFormat: "markdown" | "html";
};

type ExportResponse = {
  ok: boolean;
  html?: string;
  url?: string;
  title?: string;
  error?: string;
};

type LinksResponse = {
  ok: boolean;
  links?: string[];
  error?: string;
};

function setStatus(statusEl: HTMLElement, msg: string, isError = false): void {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "red" : "inherit";
}

function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        backendUrl: DEFAULT_BACKEND_URL,
        targetFolder: "",
        outputFormat: "markdown",
      },
      (items) => {
        const outputFormat = items.outputFormat === "html" ? "html" : "markdown";
        resolve({
          backendUrl: String(items.backendUrl ?? DEFAULT_BACKEND_URL),
          targetFolder: String(items.targetFolder ?? ""),
          outputFormat,
        });
      }
    );
  });
}

function saveSettings(settings: Settings): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => resolve());
  });
}

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["dist/content.js"],
  });
}

function sanitizeSlug(baseTitle: string): string {
  const safe = (baseTitle || "page").replace(/[^a-z0-9-]+/gi, "_");
  return safe || "page";
}

function sendMessage<T>(tabId: number, message: unknown): Promise<T | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      resolve(response as T | undefined);
    });
  });
}

async function sendToBackend(
  statusEl: HTMLElement,
  html: string,
  meta: { url?: string; title?: string; relativePath?: string }
): Promise<void> {
  const settings = await loadSettings();
  const backendUrl = settings.backendUrl.trim();

  if (!backendUrl) {
    setStatus(statusEl, "Backend URL is not configured.", true);
    return;
  }

  const cleanBase = backendUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/api/import-html`;

  const payload = {
    html,
    url: meta.url || "",
    title: meta.title || "",
    output_format: settings.outputFormat || "markdown",
    target_folder: settings.targetFolder || "",
    relative_path: meta.relativePath || "",
  };

  setStatus(statusEl, "Sending page to backend...");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error: ${res.status} ${text}`);
  }

  const data = (await res.json().catch(() => ({}))) as {
    saved_markdown?: string;
    saved_html?: string;
  };
  const info = data.saved_markdown || data.saved_html || "";
  if (info) {
    setStatus(statusEl, `Page sent to backend (${info}).`);
  } else {
    setStatus(statusEl, "Page sent to backend.");
  }
}

function initPopup(): void {
  const btnSingle = document.getElementById("export-single") as HTMLButtonElement | null;
  const btnWithLinks = document.getElementById(
    "export-with-links"
  ) as HTMLButtonElement | null;
  const statusEl = document.getElementById("status");
  const sameOriginCheckbox = document.getElementById(
    "same-origin-only"
  ) as HTMLInputElement | null;
  const maxPagesInput = document.getElementById("max-pages") as HTMLInputElement | null;
  const maxDepthInput = document.getElementById("max-depth") as HTMLInputElement | null;
  const backendUrlInput = document.getElementById(
    "backend-url"
  ) as HTMLInputElement | null;
  const targetFolderInput = document.getElementById(
    "target-folder"
  ) as HTMLInputElement | null;
  const outputFormatSelect = document.getElementById(
    "output-format"
  ) as HTMLSelectElement | null;
  const saveSettingsBtn = document.getElementById(
    "save-settings"
  ) as HTMLButtonElement | null;

  if (
    !btnSingle ||
    !btnWithLinks ||
    !statusEl ||
    !sameOriginCheckbox ||
    !maxPagesInput ||
    !maxDepthInput ||
    !backendUrlInput ||
    !targetFolderInput ||
    !outputFormatSelect ||
    !saveSettingsBtn
  ) {
    console.error("Popup elements are missing; cannot initialize.");
    return;
  }

  const status = statusEl;
  const sameOriginInput = sameOriginCheckbox;
  const maxPagesField = maxPagesInput;
  const maxDepthField = maxDepthInput;
  const backendUrlField = backendUrlInput;
  const targetFolderField = targetFolderInput;
  const outputFormatField = outputFormatSelect;
  const saveSettingsButton = saveSettingsBtn;
  const singleButton = btnSingle;
  const withLinksButton = btnWithLinks;

  async function exportSinglePage(): Promise<void> {
    try {
      setStatus(status, chrome.i18n.getMessage("statusExportingSingle"));

      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        setStatus(status, chrome.i18n.getMessage("errorNoActiveTab"), true);
        return;
      }

      await ensureContentScript(tab.id);

      const response = await sendMessage<ExportResponse>(tab.id, { type: "EXPORT_HTML" });
      if (!response || !response.ok) {
        const msg = response?.error || chrome.i18n.getMessage("errorExtractFailed");
        setStatus(status, msg, true);
        return;
      }

      const baseTitle = sanitizeSlug(response.title || tab.title || "page");
      const resolvedUrl = response.url || tab.url || "";

      await sendToBackend(status, response.html || "", {
        url: resolvedUrl,
        title: baseTitle,
        relativePath: resolvedUrl ? new URL(resolvedUrl).pathname : "",
      });
    } catch (err) {
      console.error(err);
      setStatus(status, chrome.i18n.getMessage("errorUnexpected", [String(err)]), true);
    }
  }

  async function exportPageWithLinks(): Promise<void> {
    try {
      const sameOriginOnly = sameOriginInput.checked;
      const maxPages = Math.max(1, Math.min(500, parseInt(maxPagesField.value || "20", 10)));
      const maxDepth = Math.max(1, Math.min(10, parseInt(maxDepthField.value || "1", 10)));

      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        setStatus(status, chrome.i18n.getMessage("errorNoActiveTab"), true);
        return;
      }

      await ensureContentScript(tab.id);

      const startUrl = tab.url || "";
      if (!startUrl) {
        setStatus(status, "Active tab has no URL.", true);
        return;
      }

      const visited = new Set<string>();
      const queue: Array<{ url: string; depth: number; tabId: number | null; isRoot: boolean }> = [];

      const normalizeUrl = (candidate: string): string | null => {
        try {
          const parsed = new URL(candidate);
          parsed.hash = "";
          return parsed.toString();
        } catch {
          return null;
        }
      };

      const rootUrlNorm = normalizeUrl(startUrl);
      if (!rootUrlNorm) {
        setStatus(status, "Failed to parse active tab URL.", true);
        return;
      }

      visited.add(rootUrlNorm);
      queue.push({ url: rootUrlNorm, depth: 0, tabId: tab.id, isRoot: true });

      let processed = 0;

      setStatus(status, chrome.i18n.getMessage("statusExportingMulti", [String(maxPages)]));

      while (queue.length && processed < maxPages) {
        const current = queue.shift();
        if (!current) break;
        const { url, depth, isRoot } = current;

        let currentTabId = current.tabId;

        if (!currentTabId) {
          const newTab = await chrome.tabs.create({
            url,
            active: false,
          });

          await new Promise((resolve) => {
            function listener(tabId: number, info: chrome.tabs.TabChangeInfo) {
              if (tabId === newTab.id && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(undefined);
              }
            }
            chrome.tabs.onUpdated.addListener(listener);
          });

          currentTabId = newTab.id ?? null;
        }

        if (!currentTabId) continue;

        await ensureContentScript(currentTabId);

        setStatus(
          status,
          chrome.i18n.getMessage("statusExportingPageNofM", [
            String(processed + 1),
            String(maxPages),
          ])
        );

        const exportResponse = await sendMessage<ExportResponse>(currentTabId, {
          type: "EXPORT_HTML",
        });

        if (exportResponse && exportResponse.ok) {
          const baseTitle = sanitizeSlug(exportResponse.title || "page");

          try {
            const urlForPath = exportResponse.url || url;
            const relPath = urlForPath ? new URL(urlForPath).pathname : "";

            await sendToBackend(status, exportResponse.html || "", {
              url: urlForPath,
              title: baseTitle,
              relativePath: relPath,
            });
          } catch (err) {
            console.error(err);
            setStatus(status, `Unexpected backend error: ${String(err)}`, true);
          }
        }

        processed += 1;

        if (depth < maxDepth - 1 && processed < maxPages) {
          const linksResponse = await sendMessage<LinksResponse>(currentTabId, {
            type: "GET_LINKS",
            sameOriginOnly,
            maxLinks: maxPages,
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

        if (!isRoot && currentTabId) {
          chrome.tabs.remove(currentTabId);
        }
      }

      setStatus(status, chrome.i18n.getMessage("statusExportDoneMulti", [String(processed)]));
    } catch (err) {
      console.error(err);
      setStatus(status, chrome.i18n.getMessage("errorUnexpected", [String(err)]), true);
    }
  }

  singleButton.addEventListener("click", exportSinglePage);
  withLinksButton.addEventListener("click", exportPageWithLinks);

  void (async () => {
    try {
      if (chrome.i18n) {
        const t = (key: string, fallback: string) => chrome.i18n.getMessage(key) || fallback;

        btnSingle.textContent = t("btnExportSingle", "Export current page HTML");
        btnWithLinks.textContent = t("btnExportWithLinks", "Export page + internal links");

        const sameOriginLabel = document.getElementById("label-same-origin");
        const maxPagesLabel = document.getElementById("label-max-pages");
        const maxDepthLabel = document.getElementById("label-max-depth");
        if (sameOriginLabel) {
          sameOriginLabel.textContent = t("labelSameOrigin", "Only same-origin links");
        }
        if (maxPagesLabel) {
          maxPagesLabel.textContent = t("labelMaxPages", "Max. pages (including this one):");
        }
        if (maxDepthLabel) {
          maxDepthLabel.textContent = t("labelMaxDepth", "Max. depth (levels):");
        }
      }

      const settings = await loadSettings();
      backendUrlField.value = settings.backendUrl || DEFAULT_BACKEND_URL;
      targetFolderField.value = settings.targetFolder || "";
      outputFormatField.value = settings.outputFormat || "markdown";
    } catch (err) {
      console.error("Failed to load settings", err);
    }
  })();

  saveSettingsButton.addEventListener("click", async () => {
    try {
      await saveSettings({
        backendUrl: backendUrlField.value.trim() || DEFAULT_BACKEND_URL,
        targetFolder: targetFolderField.value.trim(),
        outputFormat: (outputFormatField.value || "markdown") as Settings["outputFormat"],
      });
      setStatus(status, "Settings saved.");
    } catch (err) {
      console.error(err);
      setStatus(status, `Failed to save settings: ${String(err)}`, true);
    }
  });
}

if (typeof window !== "undefined") {
  window.__popupInit = initPopup;
}

document.addEventListener("DOMContentLoaded", initPopup);

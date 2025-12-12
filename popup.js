// popup.js

const btnSingle = document.getElementById("export-single");
const btnWithLinks = document.getElementById("export-with-links");
const statusEl = document.getElementById("status");
const sameOriginCheckbox = document.getElementById("same-origin-only");
const maxPagesInput = document.getElementById("max-pages");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "red" : "inherit";
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

function sanitizeFilename(baseTitle) {
  const safe = (baseTitle || "page").replace(/[^a-z0-9\-]+/gi, "_");
  return safe || "page";
}

function downloadHtml(html, suggestedName) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download(
    {
      url,
      filename: suggestedName + ".html",
      saveAs: false,
    },
    () => {
      if (chrome.runtime.lastError) {
        setStatus("Download failed: " + chrome.runtime.lastError.message, true);
      }
    }
  );
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

      const baseTitle = sanitizeFilename(response.title || tab.title || "page");
      downloadHtml(response.html, baseTitle);
      setStatus(chrome.i18n.getMessage("statusExportDoneSingle", [baseTitle]));
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
        maxLinks: maxPages - 1, // -1, weil Startseite selbst auch exportiert wird
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

        // Hinweis: Popup bitte offen lassen, während der Export läuft.

        let index = 0;
        for (const url of allUrls) {
          index += 1;
          setStatus(
            chrome.i18n.getMessage("statusExportingPageNofM", [
              String(index),
              String(allUrls.length),
            ])
          );

          // Neues Tab öffnen, Seite laden, extrahieren
          const newTab = await chrome.tabs.create({
            url,
            active: false,
          });

          // Warten, bis die Seite fertig geladen ist
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
                  const baseTitle = sanitizeFilename(
                    resp.title || newTab.title || "page"
                  );
                  downloadHtml(resp.html, baseTitle);
                }
                resolve();
              }
            );
          });

          // Tab wieder schließen, damit es übersichtlich bleibt
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


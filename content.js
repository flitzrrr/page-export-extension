// content.js
(function () {
  function extractFullPageHtml() {
    return document.documentElement.outerHTML;
  }

  function collectInternalLinks(options) {
    const { maxLinks = 100, sameOriginOnly = true } = options || {};
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((href) => !!href);

    const origin = location.origin;
    const unique = Array.from(new Set(links)).filter((href) => {
      if (sameOriginOnly) {
        try {
          const u = new URL(href);
          return u.origin === origin;
        } catch {
          return false;
        }
      }
      return true;
    });

    return unique.slice(0, maxLinks);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (!message || !message.type) return;

      if (message.type === "EXPORT_HTML") {
        const html = extractFullPageHtml();
        sendResponse({ ok: true, html, url: location.href, title: document.title });
      } else if (message.type === "GET_LINKS") {
        const links = collectInternalLinks({
          maxLinks: message.maxLinks,
          sameOriginOnly: message.sameOriginOnly,
        });
        sendResponse({ ok: true, links, baseUrl: location.href });
      }
    } catch (err) {
      console.error("Page export content script error:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  });
})();


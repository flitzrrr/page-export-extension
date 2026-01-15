import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createPopupHtml() {
  return `<!doctype html>
  <html>
    <body>
      <button id="export-single">Export current page HTML</button>
      <button id="export-with-links">Export page + internal links</button>
      <div class="options">
        <label>
          <input type="checkbox" id="same-origin-only" checked />
          <span id="label-same-origin">Only same-origin links</span>
        </label>
        <label>
          <span id="label-max-pages">Max. pages (including this one):</span>
          <input type="number" id="max-pages" min="1" max="500" value="20" />
        </label>
        <label>
          <span id="label-max-depth">Max. depth (levels):</span>
          <input type="number" id="max-depth" min="1" max="5" value="1" />
        </label>
      </div>
      <div class="settings">
        <input type="text" id="backend-url" />
        <input type="text" id="target-folder" />
        <select id="output-format">
          <option value="markdown">Markdown</option>
          <option value="html">HTML only</option>
        </select>
        <button id="save-settings">Save settings</button>
      </div>
      <div id="status"></div>
    </body>
  </html>`;
}

function createChromeMock() {
  const storageData = {
    backendUrl: "http://localhost:8000",
    targetFolder: "",
    outputFormat: "markdown",
  };

  return {
    i18n: {
      getMessage: () => "",
    },
    storage: {
      sync: {
        get: (_defaults, callback) => callback(storageData),
        set: (_settings, callback) => callback(),
      },
    },
    tabs: {
      query: async () => [],
      sendMessage: (_tabId, _message, callback) => callback({ ok: true }),
      create: async () => ({ id: 1 }),
      onUpdated: {
        addListener: () => {},
        removeListener: () => {},
      },
      remove: () => {},
    },
    scripting: {
      executeScript: async () => {},
    },
  };
}

test("popup initializes without crashing", async () => {
  const dom = new JSDOM(createPopupHtml(), {
    runScripts: "dangerously",
    url: "https://example.com",
  });

  global.window = dom.window;
  global.document = dom.window.document;
  const chromeMock = createChromeMock();
  global.chrome = chromeMock;
  dom.window.chrome = chromeMock;

  const scriptPath = join(__dirname, "..", "dist", "popup.js");
  const scriptContent = await readFile(scriptPath, "utf-8");

  dom.window.eval(scriptContent);
  assert.equal(typeof dom.window.__popupInit, "function");

  dom.window.__popupInit();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const backendInput = dom.window.document.getElementById("backend-url");
  assert.equal(backendInput.value, "http://localhost:8000");

  const saveButton = dom.window.document.getElementById("save-settings");
  saveButton.click();

  delete global.window;
  delete global.document;
  delete global.chrome;
});

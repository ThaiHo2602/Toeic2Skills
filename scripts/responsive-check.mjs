import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const appUrl = "http://127.0.0.1:5173/";
const debuggingPort = 9333;
const userDataDir = new URL("../.tmp-chrome-responsive", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const viewports = [
  [320, 568],
  [375, 812],
  [390, 844],
  [414, 896],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

const pages = [
  { name: "Home", action: null },
  { name: "Practice landing", action: () => navigateByAria("Luyện tập") },
  { name: "Reading practice", action: () => clickByText("Luyện tập thường") },
  { name: "Tests", action: () => navigateByAria("Bài thi") },
  { name: "Listening test/practice", action: () => clickByText("Bắt đầu bài thi") },
  { name: "Progress", action: () => navigateByAria("Tiến độ") },
  { name: "Premium", action: () => navigateByAria("Premium") },
  { name: "Admin question bank", action: () => navigateByAria("Admin") },
  { name: "Premium modal", action: async () => {
    await navigateByAria("Luyện tập");
    await clickByText("Luyện thích ứng");
  } },
];

let ws;
let nextId = 1;
const pending = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rmQuiet(path) {
  for (let i = 0; i < 6; i += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch {
      await sleep(250);
    }
  }
}

async function fetchJson(url) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Timed out fetching ${url}`);
}

function send(method, params = {}, sessionId) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

async function connect() {
  const version = await fetchJson(`http://127.0.0.1:${debuggingPort}/json/version`);
  ws = new WebSocket(version.webSocketDebuggerUrl);
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
    }
  });
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
}

let sessionId;

async function createPage() {
  const target = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
}

async function setViewport(width, height) {
  await send(
    "Emulation.setDeviceMetricsOverride",
    {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 768,
    },
    sessionId,
  );
}

async function navigateFresh() {
  await send("Page.navigate", { url: appUrl }, sessionId);
  await sleep(700);
  await evaluate("localStorage.clear(); location.reload();");
  await sleep(900);
  await clickByText("Tiếp tục");
  await sleep(300);
  await clickByText("Vào dashboard");
  await sleep(700);
}

async function evaluate(expression) {
  const result = await send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );
  return result.result.value;
}

function clickByAria(label) {
  return evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button,[aria-label]')]
        .find((node) => {
          const rect = node.getBoundingClientRect();
          const styles = getComputedStyle(node);
          return node.getAttribute('aria-label') === ${JSON.stringify(label)} &&
            rect.width > 0 &&
            rect.height > 0 &&
            styles.display !== 'none' &&
            styles.visibility !== 'hidden';
        });
      if (el) el.click();
      return Boolean(el);
    })()
  `);
}

async function navigateByAria(label) {
  if (await clickByAria(label)) return true;
  if (await clickByAria("Thêm")) {
    await sleep(200);
    return clickByAria(label);
  }
  return false;
}

function clickByText(text) {
  return evaluate(`
    (() => {
      const el = [...document.querySelectorAll('button')]
        .find((node) => (node.textContent || '').includes(${JSON.stringify(text)}));
      if (el) el.click();
      return Boolean(el);
    })()
  `);
}

async function inspect() {
  return evaluate(`
    (() => {
      const root = document.documentElement;
      const body = document.body;
      const viewportWidth = window.innerWidth;
      const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
      const selectors = 'body *:not(script):not(style)';
      const offenders = [...document.querySelectorAll(selectors)]
        .map((el) => {
          const rect = el.getBoundingClientRect();
          const styles = getComputedStyle(el);
          return { el, rect, styles };
        })
        .filter(({ rect, styles }) =>
          rect.width > 1 &&
          rect.height > 1 &&
          styles.display !== 'none' &&
          styles.visibility !== 'hidden' &&
          styles.position !== 'fixed' &&
          (rect.left < -1 || rect.right > viewportWidth + 1)
        )
        .slice(0, 5)
        .map(({ el, rect }) => ({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || ''),
          text: (el.textContent || '').trim().slice(0, 48),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }));
      const narrowCards = [...document.querySelectorAll('.glass-card, .part-card, .test-card, .pricing-card, .metric-card')]
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { el, rect };
        })
        .filter(({ rect }) => rect.width > 1 && rect.width < Math.min(220, viewportWidth - 32))
        .slice(0, 5)
        .map(({ el, rect }) => ({
          tag: el.tagName.toLowerCase(),
          className: String(el.className || ''),
          text: (el.textContent || '').trim().slice(0, 48),
          width: Math.round(rect.width),
        }));
      return {
        viewportWidth,
        scrollWidth,
        hasHorizontalOverflow: scrollWidth > viewportWidth + 1,
        offenders,
        narrowCards,
      };
    })()
  `);
}

async function run() {
  await rmQuiet(userDataDir);
  await mkdir(userDataDir, { recursive: true });

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ]);

  try {
    await connect();
    await createPage();
    const failures = [];

    for (const [width, height] of viewports) {
      await setViewport(width, height);
      await navigateFresh();
      for (const page of pages) {
        if (page.action) {
          await page.action();
          await sleep(500);
        }
        const result = await inspect();
        if (result.hasHorizontalOverflow || result.offenders.length || result.narrowCards.length) {
          failures.push({ viewport: `${width}x${height}`, page: page.name, ...result });
        }
      }
    }

    if (failures.length) {
      console.log(JSON.stringify({ ok: false, failures }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, checkedViewports: viewports.map(([w, h]) => `${w}x${h}`), pages: pages.map((p) => p.name) }, null, 2));
    }
  } finally {
    ws?.close();
    chrome.kill();
    await sleep(500);
    await rmQuiet(userDataDir);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

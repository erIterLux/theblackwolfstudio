import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'quality');
const screenshotDir = path.join(reportDir, 'screenshots');
const previewPort = Number(process.env.BW_PREVIEW_PORT || 4173);
const debugPort = Number(process.env.BW_CHROME_DEBUG_PORT || 9222);
const baseUrl = `http://127.0.0.1:${previewPort}`;
function resolveChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    process.platform === 'win32' ? path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe') : null,
    process.platform === 'win32' ? path.join(process.env.PROGRAMFILES || '', 'Microsoft/Edge/Application/msedge.exe') : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    process.platform === 'darwin' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : null,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const chromium = resolveChromium();
const routes = [
  '/',
  '/programs',
  '/events',
  '/membership',
  '/private-training',
  '/contact',
  '/login',
  '/member',
  '/instructor',
  '/this-route-does-not-exist',
];
const viewports = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
  { name: 'desktop', width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeFileWithRetry(filePath, contents) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.writeFileSync(filePath, contents);
      return;
    } catch (error) {
      const retryable = ['EBUSY', 'EPERM', 'UNKNOWN'].includes(error?.code);
      if (!retryable || attempt === 5) throw error;
      await delay(100 * (attempt + 1));
    }
  }
}

async function waitForUrl(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Server is still starting.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(url) {
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) || [];
      callbacks.forEach((callback) => callback(message.params));
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, callback) {
    const callbacks = this.listeners.get(method) || [];
    callbacks.push(callback);
    this.listeners.set(method, callbacks);
    return () => {
      this.listeners.set(method, (this.listeners.get(method) || []).filter((item) => item !== callback));
    };
  }

  waitFor(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        remove();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const remove = this.on(method, (params) => {
        clearTimeout(timer);
        remove();
        resolve(params);
      });
    });
  }

  close() {
    this.socket.close();
  }
}

function slug(value) {
  if (value === '/') return 'home';
  return value.replace(/^\//, '').replaceAll('/', '-') || 'page';
}

const auditExpression = `(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 0
      && rect.height > 0;
  };
  const labelText = (element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim();
      if (text) return text;
    }
    const id = element.id;
    if (id) {
      const explicitLabel = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (explicitLabel?.textContent.trim()) return explicitLabel.textContent.trim();
    }
    const wrappingLabel = element.closest('label');
    if (wrappingLabel?.textContent.trim()) return wrappingLabel.textContent.trim();
    return '';
  };
  const accessibleName = (element) => (
    element.getAttribute('aria-label')
    || labelText(element)
    || element.getAttribute('alt')
    || element.getAttribute('title')
    || (element.matches('input[type="button"], input[type="submit"], input[type="reset"]') ? element.value : '')
    || element.textContent
    || ''
  ).trim();

  const interactive = [...document.querySelectorAll(
    'a[href], button, input, select, textarea, [role="button"], [role="link"]'
  )].filter(visible);
  const fields = [...document.querySelectorAll('input, select, textarea')]
    .filter((element) => visible(element) && !['hidden', 'submit', 'button', 'reset'].includes(element.type));
  const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const smallTargets = interactive.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width < 36 || rect.height < 36;
  }).map((element) => ({
    tag: element.tagName.toLowerCase(),
    name: accessibleName(element).slice(0, 80),
    width: Math.round(element.getBoundingClientRect().width),
    height: Math.round(element.getBoundingClientRect().height),
  }));

  return {
    url: location.href,
    title: document.title,
    mainCount: document.querySelectorAll('main').length,
    h1Count: document.querySelectorAll('h1').length,
    horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      - document.documentElement.clientWidth,
    emptyInteractiveNames: interactive
      .filter((element) => !accessibleName(element))
      .map((element) => element.outerHTML.slice(0, 180)),
    unlabeledFields: fields
      .filter((element) => !accessibleName(element))
      .map((element) => element.outerHTML.slice(0, 180)),
    imagesWithoutAlt: [...document.querySelectorAll('img:not([alt])')]
      .map((element) => element.outerHTML.slice(0, 180)),
    duplicateIds,
    smallTargets: smallTargets.slice(0, 20),
    smallTargetCount: smallTargets.length,
  };
})()`;

async function run() {
  if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
    throw new Error('dist/index.html is missing. Run npm run build before browser smoke testing.');
  }
  if (!chromium) {
    throw new Error('Chrome, Chromium, or Edge was not found. Set CHROMIUM_PATH to the browser executable.');
  }

  fs.mkdirSync(screenshotDir, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'black-wolf-chromium-'));
  const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(previewPort)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const chrome = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const stopProcessTree = (child) => {
    if (!child?.pid) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }
    child.kill('SIGTERM');
  };
  const cleanup = async () => {
    stopProcessTree(preview);
    stopProcessTree(chrome);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (!['EBUSY', 'EPERM'].includes(error?.code) || attempt === 7) throw error;
        await delay(150 * (attempt + 1));
      }
    }
  };

  try {
    await waitForUrl(`${baseUrl}/`);
    await waitForUrl(`http://127.0.0.1:${debugPort}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
    const target = await targetResponse.json();
    const cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.ready;
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Log.enable'),
    ]);

    const results = [];
    let routeErrors = [];
    cdp.on('Runtime.exceptionThrown', (params) => {
      routeErrors.push(params?.exceptionDetails?.text || 'Uncaught browser exception');
    });
    cdp.on('Runtime.consoleAPICalled', (params) => {
      if (params.type !== 'error') return;
      const text = (params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
      if (!/Firebase is not configured/i.test(text)) routeErrors.push(text || 'console.error');
    });
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (entry?.level === 'error' && !/favicon|Firebase is not configured/i.test(entry.text || '')) {
        routeErrors.push(entry.text);
      }
    });

    for (const viewport of viewports) {
      const { name: viewportName, ...deviceMetrics } = viewport;
      await cdp.send('Emulation.setDeviceMetricsOverride', deviceMetrics);
      for (const route of routes) {
        routeErrors = [];
        const loaded = cdp.waitFor('Page.loadEventFired');
        await cdp.send('Page.navigate', { url: `${baseUrl}${route}` });
        await loaded;
        await delay(900);
        const evaluation = await cdp.send('Runtime.evaluate', {
          expression: auditExpression,
          returnByValue: true,
          awaitPromise: true,
        });
        const audit = evaluation.result.value;
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        const screenshotFile = path.join(screenshotDir, `${viewport.name}-${slug(route)}.png`);
        await writeFileWithRetry(screenshotFile, Buffer.from(screenshot.data, 'base64'));

        const failures = [];
        const warnings = [];
        if (audit.mainCount !== 1) failures.push(`Expected one main landmark, found ${audit.mainCount}.`);
        if (audit.h1Count < 1) warnings.push('No h1 was found after the route settled.');
        if (audit.horizontalOverflow > 8) failures.push(`Horizontal overflow is ${audit.horizontalOverflow}px.`);
        if (audit.emptyInteractiveNames.length) failures.push(`${audit.emptyInteractiveNames.length} visible interactive controls have no accessible name.`);
        if (audit.imagesWithoutAlt.length) failures.push(`${audit.imagesWithoutAlt.length} images have no alt attribute.`);
        if (audit.duplicateIds.length) failures.push(`Duplicate ids: ${audit.duplicateIds.join(', ')}.`);
        if (audit.unlabeledFields.length) warnings.push(`${audit.unlabeledFields.length} visible form fields appear unlabeled.`);
        if (audit.smallTargetCount) warnings.push(`${audit.smallTargetCount} visible controls are smaller than 36px in one dimension.`);
        if (routeErrors.length) failures.push(`${routeErrors.length} browser error(s) were recorded.`);

        results.push({
          route,
          viewport: viewportName,
          audit,
          errors: [...routeErrors],
          failures,
          warnings,
          screenshot: path.relative(root, screenshotFile).replaceAll(path.sep, '/'),
        });
        console.log(`${failures.length ? 'FAIL' : 'PASS'} ${viewportName.padEnd(7)} ${route}`);
      }
    }

    cdp.close();
    const failed = results.filter((result) => result.failures.length);
    const report = {
      generatedAt: new Date().toISOString(),
      passed: failed.length === 0,
      baseUrl,
      results,
    };
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'browser-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nBrowser report: quality/browser-smoke-report.json`);
    if (failed.length) process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});

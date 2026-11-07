import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'extension');
const html = readFileSync(path.join(root, 'test/fixtures.html'), 'utf8');
const fixtureCss = readFileSync(path.join(root, 'test/fixtures.css'), 'utf8');
const proHtml = readFileSync(path.join(root, 'test/pro-fixtures.html'), 'utf8');
const proCss = readFileSync(path.join(root, 'test/pro-fixtures.css'), 'utf8');
const badgeCss = readFileSync(path.join(root, 'extension/content/badge.css'), 'utf8');
const outDir = '/opt/cursor/artifacts';
const outFile = path.join(outDir, 'badges_unstamped_tooltip.png');

function fulfill(request) {
  const url = request.url();
  if (url.startsWith('https://x.com/fcb-fixture')) {
    return request.respond({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: html,
    });
  }
  if (url.startsWith('https://x.com/') && url.includes('fixtures.css')) {
    return request.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: fixtureCss });
  }
  if (url.startsWith('https://x.com/') && url.includes('badge.css')) {
    return request.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: badgeCss });
  }
  if (url.startsWith('https://pro.x.com/fcb-fixture')) {
    return request.respond({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: proHtml,
    });
  }
  if (url.startsWith('https://pro.x.com/') && url.includes('pro-fixtures.css')) {
    return request.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: proCss });
  }
  if (url.startsWith('https://pro.x.com/') && url.includes('badge.css')) {
    return request.respond({ status: 200, contentType: 'text/css; charset=utf-8', body: badgeCss });
  }
  if (url.startsWith('http://') || url.startsWith('https://')) return request.abort();
  return request.continue();
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  enableExtensions: [extensionDir],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const workerTarget = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
    { timeout: 15000 },
  ).catch(() => null);
  if (workerTarget?.worker) {
    const worker = await workerTarget.worker();
    await worker.evaluate(() => chrome.storage.local.set({
      trustedHandles: ['trusted_desk'],
      noisyHandles: ['noisy_desk'],
      authorFlagCounts: {},
      countedPostIds: [],
    }));
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1180, height: 1480, deviceScaleFactor: 1 });
  const seen = [];
  page.on('request', (request) => seen.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('page', message.text());
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    fulfill(request).catch(() => request.abort().catch(() => {}));
  });
  await page.goto('https://x.com/fcb-fixture', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('article[data-fixture="combo"] .fcb-badge', { timeout: 15000 });

  const summary = await page.evaluate(() => [...document.querySelectorAll('article[data-fixture]')].slice(0, 8).map((article) => ({
    id: article.dataset.fixture,
    badge: article.querySelector('.fcb-badge')?.textContent || '',
  })));
  console.log(JSON.stringify(summary));

  const shift = await page.evaluate(() => {
    const problems = [];
    for (const article of document.querySelectorAll('#gallery article[data-testid="tweet"]')) {
      const host = article.querySelector('.fcb-host');
      const text = article.querySelector('[data-testid="tweetText"]');
      if (!host || !text) {
        problems.push({ id: article.dataset.fixture, missing: true });
        continue;
      }
      const clone = article.cloneNode(true);
      clone.querySelector('.fcb-host')?.remove();
      clone.style.visibility = 'hidden';
      article.parentElement.append(clone);
      const delta = text.offsetTop - clone.querySelector('[data-testid="tweetText"]').offsetTop;
      const position = getComputedStyle(host).position;
      if (Math.abs(delta) > 1 || position !== 'absolute') {
        problems.push({ id: article.dataset.fixture, delta, position });
      }
      clone.remove();
    }
    return problems;
  });
  if (shift.length) throw new Error(`badge shifted layout: ${JSON.stringify(shift)}`);

  const badge = await page.$('article[data-fixture="combo"] .fcb-badge');
  await badge.hover();
  await page.waitForFunction(() => {
    const tip = document.querySelector('.fcb-tip.fcb-tip-portal');
    if (!tip || tip.parentElement !== document.body) return false;
    const style = getComputedStyle(tip);
    return style.display !== 'none'
      && style.position === 'fixed'
      && /scores framing, not truth/i.test(tip.textContent || '')
      && /officials claim/i.test(tip.textContent || '');
  }, { timeout: 5000 });

  mkdirSync(outDir, { recursive: true });
  if (process.env.FCB_HOME_SHOT === '1') {
    await page.screenshot({ path: outFile });
    console.log(outFile);
  }

  const leaked = seen.filter((url) => !url.startsWith('https://x.com/')
    && !url.startsWith('https://pro.x.com/')
    && !url.startsWith('chrome-extension://')
    && !url.startsWith('data:')
    && !url.startsWith('blob:')
    && !url.startsWith('chrome://'));
  if (leaked.length) console.log('non-page requests', leaked.slice(0, 12));

  const extensionId = await page.evaluate(() => document.documentElement.dataset.fcbExtensionId || '');
  if (!extensionId) throw new Error('content script did not mark the fixture');
  const options = await browser.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`, { waitUntil: 'domcontentloaded' });
  await options.waitForSelector('#trusted');
  const trustedValue = await options.$eval('#trusted', (el) => el.value);
  if (!trustedValue.split('\n').includes('trusted_desk')) {
    throw new Error(`options did not load stored handles: ${trustedValue}`);
  }
  console.log('options page loaded');

  const pro = await browser.newPage();
  await pro.setViewport({ width: 1100, height: 760, deviceScaleFactor: 1 });
  pro.on('console', (message) => {
    if (message.type() === 'error') console.log('pro', message.text());
  });
  await pro.setRequestInterception(true);
  pro.on('request', (request) => {
    fulfill(request).catch(() => request.abort().catch(() => {}));
  });
  await pro.goto('https://pro.x.com/fcb-fixture', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await pro.waitForSelector('[data-testid="column"] .fcb-badge', { timeout: 15000 });
  const columns = await pro.evaluate(() => [...document.querySelectorAll('[data-testid="column"]')].map((column) => ({
    name: column.querySelector('[data-testid="columnHeader"]')?.textContent || '',
    badges: [...column.querySelectorAll('.fcb-badge')].map((badge) => badge.textContent),
  })));
  console.log(JSON.stringify(columns));
  const proShift = await pro.evaluate(() => {
    const problems = [];
    for (const article of document.querySelectorAll('[data-testid="column"] article[data-testid="tweet"]')) {
      const host = [...article.children].find((child) => child.classList.contains('fcb-host'));
      const text = article.querySelector('[data-testid="tweetText"]');
      if (!host || !text) {
        problems.push({ id: article.dataset.fixture, missing: true });
        continue;
      }
      const before = text.offsetTop;
      host.remove();
      const after = text.offsetTop;
      article.insertBefore(host, article.firstChild);
      if (Math.abs(before - after) > 1 || getComputedStyle(host).position !== 'absolute') {
        problems.push({ id: article.dataset.fixture, before, after, position: getComputedStyle(host).position });
      }
      if (!host.classList.contains('fcb-host-narrow')) problems.push({ id: article.dataset.fixture, narrow: false });
    }
    return problems;
  });
  if (proShift.length) throw new Error(`pro badge shifted layout: ${JSON.stringify(proShift)}`);
  const proBadge = await pro.$('article[data-fixture="pro-claim"] .fcb-badge');
  await proBadge.hover();
  await pro.waitForFunction(() => {
    const tip = document.querySelector('.fcb-tip.fcb-tip-portal');
    if (!tip || tip.parentElement !== document.body) return false;
    const column = document.querySelector('[data-testid="columnContent"]');
    const style = getComputedStyle(tip);
    return style.display !== 'none'
      && style.position === 'fixed'
      && !column.contains(tip)
      && /scores framing, not truth/i.test(tip.textContent || '')
      && /officials claim/i.test(tip.textContent || '');
  }, { timeout: 5000 });
  const proFile = path.join(outDir, 'pro_column_badges.png');
  await pro.screenshot({ path: proFile });
  console.log(proFile);
} finally {
  await browser.close();
}

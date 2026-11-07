import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, FROZEN_NOW } from '../test/cases.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cardHtml(card) {
  if (!card) return '';
  const date = card.datetime
    ? `<time datetime="${escapeHtml(card.datetime)}">${escapeHtml(card.dateText || card.datetime)}</time>`
    : '';
  return `<div data-testid="card.wrapper"><a href="${escapeHtml(card.href)}"><div>${escapeHtml(card.source || '')}</div><div>${escapeHtml(card.title || '')}</div>${date}</a></div>`;
}

function articleHtml(item, index) {
  const statusId = 1000 + index;
  const body = item.textHtml || escapeHtml(item.text || '');
  return `<article data-testid="tweet" role="article" data-fixture="${escapeHtml(item.id)}" style="position:relative">
  <div data-testid="User-Name">
    <a href="/${escapeHtml(item.handle)}"><span>${escapeHtml(item.authorName)}</span></a>
    <a href="/${escapeHtml(item.handle)}"><span>@${escapeHtml(item.handle)}</span></a>
  </div>
  <a class="permalink" href="/${escapeHtml(item.handle)}/status/${statusId}"><time datetime="${escapeHtml(item.postTime)}">1h</time></a>
  <div data-testid="tweetText">${body}</div>
  ${cardHtml(item.card)}
</article>`;
}

function section(item, index) {
  const expected = item.expect || 'no badge';
  return `<section class="case">
  <p class="expect">Expect ${escapeHtml(expected)}. ${escapeHtml(item.note)}</p>
  ${articleHtml(item, index)}
</section>`;
}

export function renderPage() {
  const feature = [];
  const side = [];
  const rest = [];
  CASES.forEach((item, index) => {
    const html = section(item, index);
    if (!item.gallery) rest.push(html);
    else if (item.id === 'combo') feature.push(html);
    else side.push(html);
  });
  return `<!DOCTYPE html>
<html lang="en" data-fcb-fixture="1" data-fcb-fixture-now="${FROZEN_NOW}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Framing badge fixtures</title>
  <link rel="stylesheet" href="fixtures.css">
  <link rel="stylesheet" href="../extension/content/badge.css">
</head>
<body>
  <header class="page-head">
    <p class="eyebrow">Local fixture</p>
    <h1>Framing badge fixtures</h1>
    <p>It scores framing, not truth. These are fake posts with X-shaped markup so the rules can be checked without an account. The clock is frozen at ${FROZEN_NOW} so the 48 hour examples stay put. Nothing on this page is sent anywhere.</p>
  </header>
  <div id="gallery">
    <div class="feature">${feature.join('\n')}</div>
    <div class="side">${side.join('\n')}</div>
  </div>
  <h2 class="more-title">Every rule, firing and not firing</h2>
  <div id="more">${rest.join('\n')}</div>
  <script src="fixture-bundle.js"></script>
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'test', 'fixtures.html');
  writeFileSync(file, renderPage());
  console.log(file);
}

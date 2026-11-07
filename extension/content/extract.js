import { parseVisibleDate } from '../rules/freshness.js';
import { SELECTORS } from './selectors.js';

const MEDIA_HOSTS = new Set(['pbs.twimg.com', 'video.twimg.com', 'abs.twimg.com']);

function visibleText(el) {
  if (!el) return '';
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue || '');
      return;
    }
    if (node.nodeType !== 1 || node.tagName === 'IMG') return;
    const block = /^(DIV|P|LI|H1|H2|H3|TR|SECTION|ARTICLE|TIME|BR)$/.test(node.tagName);
    if (block) parts.push('\n');
    for (const child of node.childNodes) walk(child);
    if (block) parts.push('\n');
  };
  walk(el);
  return parts.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function topMatches(root, selector) {
  if (!root?.querySelectorAll) return [];
  const nodes = [...root.querySelectorAll(selector)];
  return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
}

function fnv(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** Profile, status, hashtag, and media links are not "a source link". */
export function isSourceLink(href) {
  if (!href) return false;
  const raw = String(href).trim();
  if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) return false;
  let url;
  try {
    url = new URL(raw, 'https://x.com');
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const host = url.hostname.replace(/^www\./, '');
  const onX = host === 'x.com' || host === 'twitter.com';
  const path = url.pathname || '/';
  if (MEDIA_HOSTS.has(url.hostname)) return false;
  if (!onX) return true;
  if (/^\/[A-Za-z0-9_]{1,15}\/?$/.test(path)) return false;
  if (path.includes('/status/')) return false;
  if (path.startsWith('/hashtag/') || path.startsWith('/search') || path.startsWith('/i/')) return false;
  if (/\/(?:photo|video)\//.test(path)) return false;
  return true;
}

function textHasUrl(text) {
  return /\bhttps?:\/\/\S+/i.test(text)
    || /\b(?:t\.co|bit\.ly|tinyurl\.com)\/\S+/i.test(text)
    || /\b[a-z0-9.-]+\.[a-z]{2,}\/\S+/i.test(text);
}

function altsWithin(nodes, article) {
  const bits = [];
  for (const node of nodes) {
    node.querySelectorAll('img[alt], [role="img"][aria-label]').forEach((el) => {
      if (el.closest(SELECTORS.avatar)) return;
      const value = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
      if (value.trim()) bits.push(value.trim());
    });
  }
  if (article && nodes.length === 0) return bits;
  return bits;
}

function isoFromMs(ms) {
  if (ms == null || Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function dateIn(scope) {
  if (!scope) return null;
  const time = scope.querySelector('time[datetime]');
  if (time?.getAttribute('datetime')) {
    const parsed = Date.parse(time.getAttribute('datetime'));
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return isoFromMs(parseVisibleDate(visibleText(scope)));
}

export function extractAuthor(article) {
  const box = article.querySelector(SELECTORS.userName);
  const scope = box || article;
  let handle = '';
  const handleNode = [...scope.querySelectorAll('span, a')].find((el) => /^@[A-Za-z0-9_]{1,15}$/.test((el.textContent || '').trim()));
  if (handleNode) handle = handleNode.textContent.trim().slice(1);
  if (!handle) {
    const link = scope.querySelector('a[href^="/"]');
    const match = (link?.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (match) handle = match[1];
  }
  let name = '';
  if (box) {
    name = [...box.querySelectorAll('span')]
      .map((el) => (el.textContent || '').trim())
      .find((value) => value && !value.startsWith('@') && value !== '·') || '';
  }
  return { authorHandle: handle, authorName: name };
}

export function extractPostDate(article) {
  const time = article.querySelector(SELECTORS.statusTime);
  const attr = time?.getAttribute('datetime');
  if (!attr) return null;
  const ms = Date.parse(attr);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Article/card dates only. The status <time> is the post clock, not the linked story's date.
 * Slash dates are ignored on purpose.
 */
export function extractArticleDate(article) {
  const cards = topMatches(article, SELECTORS.card);
  for (const card of cards) {
    const found = dateIn(card);
    if (found) return found;
  }
  const textRoot = article.querySelector(SELECTORS.tweetText);
  if (!textRoot) return null;
  for (const link of textRoot.querySelectorAll('a[href]')) {
    if (!isSourceLink(link.getAttribute('href'))) continue;
    const found = dateIn(link);
    if (found) return found;
  }
  return null;
}

export function extractId(article, authorHandle, text) {
  for (const link of article.querySelectorAll('a[href*="/status/"]')) {
    const match = (link.getAttribute('href') || '').match(/\/status\/(\d+)/);
    if (match) return match[1];
  }
  return `h-${fnv(`${authorHandle}|${text.slice(0, 200)}`)}`;
}

export function extractPost(article) {
  const textNodes = topMatches(article, SELECTORS.tweetText);
  const cardNodes = topMatches(article, SELECTORS.card);
  const text = textNodes.map(visibleText).filter(Boolean).join('\n');
  const cardText = cardNodes.map(visibleText).filter(Boolean).join('\n');
  const alt = [...altsWithin(textNodes, article), ...altsWithin(cardNodes, article)].join(' ');
  const textWithAlt = [text, alt].filter(Boolean).join(' ');
  const fullText = [textWithAlt, cardText].filter(Boolean).join('\n');
  const links = [];
  article.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href');
    if (isSourceLink(href)) links.push(href);
  });
  const author = extractAuthor(article);
  const mentions = [...fullText.matchAll(/@([A-Za-z0-9_]{1,15})\b/g)].map((match) => match[1]);
  return {
    id: extractId(article, author.authorHandle, textWithAlt),
    text: textWithAlt,
    cardText,
    fullText,
    articleDateISO: extractArticleDate(article),
    postDateISO: extractPostDate(article),
    hasLink: links.length > 0 || textHasUrl(`${text}\n${cardText}`),
    links,
    mentions,
    ...author,
  };
}

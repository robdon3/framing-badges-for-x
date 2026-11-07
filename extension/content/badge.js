import { normalizeToneLabel, toneDisplayName } from '../tone/protocol.js';
import { BADGE_LABELS, BADGE_PRECEDENCE, DISCLAIMER, pickBadge, sortHits } from './labels.js';

const results = new WeakMap();
let tipSerial = 0;

function hostOf(article) {
  return [...article.children].find((el) => el.classList?.contains('fcb-host')) || null;
}

function authorSentence(author) {
  if (!author?.handle || author.handle === 'unknown') {
    return 'No author handle was found on this post.';
  }
  const handle = `@${author.handle}`;
  if (author.trusted && author.noisy) return `${handle} is on both your trusted and noisy lists.`;
  if (author.trusted) {
    return `${handle} is on your trusted list. Trust does not clear framing flags, and it is not verification.`;
  }
  if (author.noisy) {
    return `${handle} is on your noisy list. That is your label, not a verdict about this post.`;
  }
  return `${handle} is not on your trusted or noisy lists.`;
}

function countSentence(author) {
  if (author?.flagCount == null || Number.isNaN(author.flagCount)) return 'Flag count unavailable.';
  const handle = author.handle && author.handle !== 'unknown' ? `@${author.handle}` : 'this author';
  return `Flags recorded for ${handle} in this browser: ${author.flagCount}.`;
}

export function fillTooltip(tip, result) {
  const doc = tip.ownerDocument;
  tip.replaceChildren();

  const disclaimer = doc.createElement('p');
  disclaimer.className = 'fcb-disclaimer';
  disclaimer.textContent = `${DISCLAIMER} This badge scores how the post is framed. It does not check whether the post is true.`;
  tip.append(disclaimer);

  const showing = doc.createElement('p');
  showing.className = 'fcb-showing';
  const label = BADGE_LABELS[result.badge] || result.badge;
  showing.textContent = `Showing ${label}. Precedence: ${BADGE_PRECEDENCE.map((badge) => BADGE_LABELS[badge]).join(', ')}.`;
  tip.append(showing);

  const list = doc.createElement('ul');
  list.className = 'fcb-reasons';
  const hits = sortHits(result.hits || []);
  if (hits.length === 0) {
    const item = doc.createElement('li');
    item.textContent = 'None of the framing rules matched.';
    list.append(item);
  } else {
    for (const hit of hits) {
      const item = doc.createElement('li');
      const name = BADGE_LABELS[hit.badge] || hit.badge;
      item.textContent = `${name}: ${hit.why}`;
      list.append(item);
    }
  }
  for (const error of result.errors || []) {
    const item = doc.createElement('li');
    item.textContent = error.why;
    list.append(item);
  }
  tip.append(list);

  const author = doc.createElement('p');
  author.className = 'fcb-meta';
  author.textContent = `${authorSentence(result.author)} ${countSentence(result.author)}`;
  tip.append(author);

  const asyncSlot = doc.createElement('p');
  asyncSlot.className = 'fcb-async';
  asyncSlot.dataset.fcbAsync = '1';
  asyncSlot.textContent = result.asyncNote
    ? `Model check: ${result.asyncNote}`
    : 'Model check: not run. v1 is rules only, and there is no network permission for one.';
  tip.append(asyncSlot);
}

function paint(host, result) {
  const badge = host.querySelector('.fcb-badge');
  const tip = host.querySelector('.fcb-tip');
  const label = BADGE_LABELS[result.badge] || result.badge;
  badge.textContent = label;
  badge.className = `fcb-badge fcb-badge-${result.badge}`;
  badge.setAttribute('aria-label', `Framing: ${label}. ${DISCLAIMER}`);
  host.dataset.fcbBadge = result.badge;
  host.dataset.fcbRules = (result.hits || []).map((hit) => hit.ruleId).join(',');
  fillTooltip(tip, result);
  results.set(host, result);
}

function placeTip(badge, tip) {
  const doc = badge.ownerDocument;
  const view = doc.defaultView || globalThis;
  const innerWidth = view.innerWidth || 1024;
  const innerHeight = view.innerHeight || 800;
  // Portal to the document so a column's overflow or transform cannot clip it.
  if (tip.parentElement !== doc.body) doc.body.append(tip);
  tip.classList.add('fcb-tip-portal');
  const rect = badge.getBoundingClientRect();
  const width = Math.min(320, Math.max(220, innerWidth - 16));
  tip.style.display = 'block';
  tip.style.position = 'fixed';
  tip.style.width = `${width}px`;
  let left = rect.right - width;
  if (left < 8) left = 8;
  if (left + width > innerWidth - 8) left = Math.max(8, innerWidth - width - 8);
  let top = rect.bottom + 6;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  const height = tip.offsetHeight || 0;
  if (top + height > innerHeight - 8) {
    top = Math.max(8, rect.top - height - 6);
    tip.style.top = `${top}px`;
  }
}

function bindTip(badge, tip) {
  const show = () => placeTip(badge, tip);
  const hide = () => {
    tip.style.display = 'none';
  };
  badge.addEventListener('mouseenter', show);
  badge.addEventListener('mouseleave', hide);
  badge.addEventListener('focus', show);
  badge.addEventListener('blur', hide);
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of ['click', 'mousedown', 'pointerdown', 'mouseup']) {
    badge.addEventListener(type, stop);
  }
  badge.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') stop(event);
  });
}

export function ensurePositioned(article) {
  const inline = article.style?.position;
  if (inline && inline !== 'static') return;
  let computed = '';
  try {
    const view = article.ownerDocument?.defaultView;
    computed = view?.getComputedStyle?.(article)?.position || '';
  } catch {
    computed = '';
  }
  if (computed && computed !== 'static') return;
  article.dataset.fcbPositioned = 'static';
  article.style.position = 'relative';
}

export function mountBadge(article, result) {
  if (!result?.badge) return null;
  if (hostOf(article)) return hostOf(article);
  const doc = article.ownerDocument;
  ensurePositioned(article);
  const host = doc.createElement('div');
  host.className = 'fcb-host';
  const badge = doc.createElement('div');
  badge.className = 'fcb-badge';
  badge.tabIndex = 0;
  const tip = doc.createElement('div');
  tip.className = 'fcb-tip';
  tip.id = `fcb-tip-${tipSerial += 1}`;
  tip.setAttribute('role', 'tooltip');
  badge.setAttribute('aria-describedby', tip.id);
  host.append(badge, tip);
  article.insertBefore(host, article.firstChild);
  const width = article.getBoundingClientRect?.().width || 0;
  if (width > 0 && width < 420) host.classList.add('fcb-host-narrow');
  bindTip(badge, tip);
  paint(host, result);
  return host;
}

function ensureBadgeElements(host) {
  if (host.querySelector('.fcb-badge')) return;
  const doc = host.ownerDocument;
  const badge = doc.createElement('div');
  badge.className = 'fcb-badge';
  badge.tabIndex = 0;
  const tip = doc.createElement('div');
  tip.className = 'fcb-tip';
  tip.id = `fcb-tip-${tipSerial += 1}`;
  tip.setAttribute('role', 'tooltip');
  badge.setAttribute('aria-describedby', tip.id);
  host.prepend(badge, tip);
  bindTip(badge, tip);
}

/** A tone chip with no framing badge. Inserts nothing until a label is painted. */
export function mountToneHost(article) {
  const existing = hostOf(article);
  if (existing) return existing;
  const doc = article.ownerDocument;
  ensurePositioned(article);
  const host = doc.createElement('div');
  host.className = 'fcb-host';
  article.insertBefore(host, article.firstChild);
  const width = article.getBoundingClientRect?.().width || 0;
  if (width > 0 && width < 420) host.classList.add('fcb-host-narrow');
  results.set(host, {
    badge: null,
    hits: [],
    errors: [],
    author: { handle: 'unknown', flagCount: 0 },
    asyncNote: null,
  });
  return host;
}

function paintTone(host, tone) {
  const existing = host.querySelector('.fcb-tone');
  const label = normalizeToneLabel(tone?.label);
  const name = toneDisplayName(label);
  if (!name) {
    existing?.remove();
    if (host.dataset) delete host.dataset.fcbTone;
    return;
  }
  const doc = host.ownerDocument;
  const chip = existing || doc.createElement('span');
  chip.className = 'fcb-tone';
  chip.textContent = name;
  const description = `Tone: ${name}. On-device label from this Mac. It is not a framing score and it is not a fact check.`;
  chip.title = description;
  chip.setAttribute('aria-label', description);
  if (!existing) {
    const badge = host.querySelector('.fcb-badge');
    if (badge) badge.after(chip);
    else host.prepend(chip);
  }
  if (host.dataset) host.dataset.fcbTone = label;
}

/** Async checkers call this. Tone is a separate chip and does not change the framing badge. */
export function applyAsyncResult(article, asyncResult) {
  let host = hostOf(article);
  const previous = host ? results.get(host) : null;
  const extraHits = (asyncResult?.hits || []).filter((hit) => hit?.badge);
  const note = asyncResult?.note || asyncResult?.detail || '';
  const hits = [...(previous?.hits || []), ...extraHits];
  const badge = pickBadge(hits);
  const toneLabel = asyncResult && Object.prototype.hasOwnProperty.call(asyncResult, 'tone')
    ? toneDisplayName(asyncResult.tone?.label)
    : null;
  if (!host) {
    if (!badge && !toneLabel) return null;
    if (badge) {
      host = mountBadge(article, {
        badge,
        hits,
        errors: previous?.errors || [],
        author: previous?.author || { handle: 'unknown', flagCount: 0 },
        asyncNote: note || (extraHits.length ? 'Extra result attached.' : null),
      });
    } else {
      host = mountToneHost(article);
    }
  } else if (badge) {
    ensureBadgeElements(host);
    const next = {
      badge,
      hits,
      errors: previous?.errors || [],
      author: previous?.author || { handle: 'unknown', flagCount: 0 },
      asyncNote: note || (extraHits.length ? 'Extra result attached.' : previous?.asyncNote || null),
    };
    paint(host, next);
  }
  if (!host) return null;
  if (asyncResult && Object.prototype.hasOwnProperty.call(asyncResult, 'tone')) paintTone(host, asyncResult.tone);
  if (!host.querySelector('.fcb-badge') && !host.querySelector('.fcb-tone')) {
    host.remove();
    return null;
  }
  return results.get(host) || { badge: badge || null, hits };
}

export function hideOpenTips(doc) {
  doc.querySelectorAll('.fcb-tip').forEach((tip) => {
    tip.style.display = 'none';
  });
}

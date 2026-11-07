import { TONE_LABELS, normalizeToneLabel, toneDisplayName } from './protocol.js';

function ensurePositioned(article) {
  const inline = article.style?.position;
  if (inline && inline !== 'static') return;
  let computed = '';
  try {
    computed = article.ownerDocument?.defaultView?.getComputedStyle?.(article)?.position || '';
  } catch {
    computed = '';
  }
  if (computed && computed !== 'static') return;
  if (article.dataset) article.dataset.fcbPositioned = 'static';
  article.style.position = 'relative';
}

/** Saved hide-list. Only tone ids, in label order. Never post text. */
export function normalizeHiddenTones(raw) {
  const selected = new Set();
  const values = Array.isArray(raw) ? raw : [];
  for (const value of values) {
    const label = normalizeToneLabel(value);
    if (label) selected.add(label);
  }
  return TONE_LABELS.map(([id]) => id).filter((id) => selected.has(id));
}

export function shouldCollapsePost({ label, hiddenTones, revealed, postId }) {
  const normalized = normalizeToneLabel(label);
  if (!normalized) return false;
  if (revealed?.has(String(postId || ''))) return false;
  return normalizeHiddenTones(hiddenTones).includes(normalized);
}

function hiddenBar(article) {
  return [...article.children].find((el) => el.classList?.contains('fcb-hidden-bar')) || null;
}

/**
 * Collapse or restore one article. The bar and Show button are extension elements.
 * X's own controls are left in the tree and are not clicked.
 */
export function syncPostCollapse(article, { label, hiddenTones, revealed, postId, onShow } = {}) {
  if (!article) return false;
  const collapse = shouldCollapsePost({ label, hiddenTones, revealed, postId });
  const bar = hiddenBar(article);
  if (!collapse) {
    if (bar) bar.remove();
    if (article.dataset?.fcbCollapsed) delete article.dataset.fcbCollapsed;
    if (article.classList?.contains('fcb-collapsed')) article.classList.remove('fcb-collapsed');
    return false;
  }
  ensurePositioned(article);
  // data-fcb-collapsed survives X rewriting className on hover. The class does not.
  if (article.dataset) {
    if (article.dataset.fcbCollapsed !== '1') article.dataset.fcbCollapsed = '1';
  } else if (article.getAttribute?.('data-fcb-collapsed') !== '1') {
    article.setAttribute('data-fcb-collapsed', '1');
  }
  const name = toneDisplayName(label);
  const text = `Hidden: ${name}`;
  if (bar) {
    const labelNode = [...bar.children].find((el) => el.classList?.contains('fcb-hidden-label'));
    if (labelNode && labelNode.textContent !== text) labelNode.textContent = text;
    return true;
  }
  const doc = article.ownerDocument;
  const next = doc.createElement('div');
  next.className = 'fcb-hidden-bar';
  const labelNode = doc.createElement('span');
  labelNode.className = 'fcb-hidden-label';
  labelNode.textContent = text;
  const show = doc.createElement('button');
  show.type = 'button';
  show.className = 'fcb-show';
  show.textContent = 'Show';
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of ['click', 'mousedown', 'pointerdown', 'mouseup']) {
    next.addEventListener(type, stop);
  }
  show.addEventListener('click', (event) => {
    stop(event);
    onShow?.(String(postId || ''));
  });
  next.append(labelNode, show);
  article.insertBefore(next, article.firstChild);
  return true;
}

export function collapsedCount(root) {
  if (!root?.querySelectorAll) return 0;
  return root.querySelectorAll('.fcb-hidden-bar').length;
}

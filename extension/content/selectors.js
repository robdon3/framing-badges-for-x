/**
 * All X DOM hooks live here. When the site renames a test id, change this file only.
 *
 * Primary (current x.com):
 *   article[data-testid="tweet"]
 *   [data-testid="tweetText"]
 *   [data-testid="User-Name"]
 *   a[href*="/status/"] time[datetime]
 *   [data-testid="card.wrapper"] and the large/small card layouts
 *
 * Fallbacks are the second selector in each comma list, plus article[role="article"]
 * when the tweet test id is missing but the text or the name is still there.
 * We do not scrape the whole article: action bars and view counts would false-flag.
 *
 * X Pro (pro.x.com) posts use the same article[data-testid="tweet"] markup.
 * That is from public selector lists checked through March 2026, not a logged-in
 * session. Each column scrolls on its own inside columnContent, not the window.
 * If columnContent is missing, the column element is the scroll root.
 */
export const SELECTORS = {
  post: 'article[data-testid="tweet"]',
  postFallback: 'article[role="article"]',
  tweetText: '[data-testid="tweetText"], [data-testid="tweet-text"]',
  userName: '[data-testid="User-Name"], [data-testid="user-name"]',
  statusTime: 'a[href*="/status/"] time[datetime]',
  card: '[data-testid="card.wrapper"], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"], [data-testid="card.layoutLarge.detail"]',
  avatar: '[data-testid="Tweet-User-Avatar"], [data-testid="tweet-avatar"]',
  column: '[data-testid="column"]',
  columnScroll: '[data-testid="columnContent"]',
};

/** The element whose own scrollport shows this post, or null on the home timeline. */
export function columnScrollRoot(post) {
  const scroller = post.closest?.(SELECTORS.columnScroll);
  if (scroller) return scroller;
  return post.closest?.(SELECTORS.column) || null;
}

export function findPosts(root) {
  if (!root?.querySelectorAll) return [];
  const found = new Set();
  const add = (el) => {
    if (el?.nodeType === 1) found.add(el);
  };
  if (root.nodeType === 1 && root.matches?.(SELECTORS.post)) add(root);
  root.querySelectorAll(SELECTORS.post).forEach(add);
  const considerFallback = (el) => {
    if (!el?.matches?.(SELECTORS.postFallback) || el.matches(SELECTORS.post)) return;
    if (el.querySelector(SELECTORS.tweetText) || el.querySelector(SELECTORS.userName)) add(el);
  };
  root.querySelectorAll(SELECTORS.postFallback).forEach(considerFallback);
  if (root.nodeType === 1) considerFallback(root);
  return [...found];
}

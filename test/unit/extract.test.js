import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import { extractPost, isSourceLink } from '../../extension/content/extract.js';
import { findPosts } from '../../extension/content/selectors.js';

function doc(html) {
  return parseHTML(html).document;
}

describe('extract', () => {
  it('reads the post, ignores the avatar, and keeps card dates off the status clock', () => {
    const article = doc(`<article data-testid="tweet">
      <div data-testid="Tweet-User-Avatar"><img alt="🚨"></div>
      <div data-testid="User-Name"><a href="/ada"><span>Ada</span></a><a href="/ada"><span>@ada</span></a></div>
      <a href="/ada/status/42"><time datetime="2026-11-07T11:30:00.000Z">1h</time></a>
      <div data-testid="tweetText">See this <img alt="🚨"></div>
      <div data-testid="card.wrapper"><a href="https://example.com/story"><div>October 1, 2026</div></a></div>
    </article>`).querySelector('article');
    const post = extractPost(article);
    assert.equal(post.id, '42');
    assert.equal(post.authorHandle, 'ada');
    assert.match(post.text, /🚨/);
    assert.equal(post.postDateISO, '2026-11-07T11:30:00.000Z');
    assert.equal(post.articleDateISO, '2026-10-01T00:00:00.000Z');
    assert.equal(post.hasLink, true);
    assert.equal(isSourceLink('/ada'), false);
    assert.equal(isSourceLink('/ada/status/42'), false);
    assert.equal(isSourceLink('https://pbs.twimg.com/media/abc.jpg'), false);
    assert.equal(isSourceLink('https://t.co/abc'), true);
    assert.equal(isSourceLink('https://example.com/bridge'), true);
  });

  it('does not guess a slash date or a date that is only in the post body', () => {
    const slash = doc(`<article data-testid="tweet">
      <div data-testid="tweetText">BREAKING: November 1, 2020 was loud.</div>
      <div data-testid="card.wrapper"><a href="https://example.com/s"><div>01/11/2020</div></a></div>
    </article>`).querySelector('article');
    assert.equal(extractPost(slash).articleDateISO, null);
  });

  it('falls back to role=article when the tweet test id is missing', () => {
    const document = doc(`<div>
      <article role="article"><div data-testid="tweetText">Hello</div><div data-testid="User-Name"><span>@ada</span></div></article>
      <article data-testid="tweet" role="article"><div data-testid="tweetText">Real</div></article>
    </div>`);
    const posts = findPosts(document);
    assert.equal(posts.length, 2);
    assert.equal(findPosts(posts[1]).length, 1);
  });
});

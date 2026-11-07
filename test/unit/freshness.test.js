import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateFreshness, FORTY_EIGHT_HOURS_MS, parseVisibleDate } from '../../extension/rules/freshness.js';
import { snapshot } from '../helpers.js';

const NOW = '2026-11-07T12:00:00.000Z';
const POST = '2026-11-07T12:00:00.000Z';

function at(iso, extra = {}) {
  return evaluateFreshness(snapshot({
    text: 'BREAKING: the council posted a notice about the bridge.',
    articleDateISO: iso,
    postDateISO: POST,
    hasLink: true,
    ...extra,
  }), { now: NOW });
}

describe('freshness', () => {
  it('flags a linked date more than 48 hours older than the post when framed as news', () => {
    const hit = at('2026-10-01T12:00:00.000Z');
    assert.equal(hit.badge, 'recycled');
    assert.match(hit.why, /48 hours/);
    assert.match(hit.why, /2026-10-01/);
  });

  it('uses a 48 hour boundary and does not guess when no date was parsed', () => {
    const exactly = new Date(Date.parse(POST) - FORTY_EIGHT_HOURS_MS).toISOString();
    const justOver = new Date(Date.parse(POST) - FORTY_EIGHT_HOURS_MS - 60 * 1000).toISOString();
    assert.equal(at(exactly), null);
    assert.equal(at(justOver).badge, 'recycled');
    assert.equal(at('2026-11-05T13:00:00.000Z'), null);
    assert.equal(at('2026-11-05T11:00:00.000Z').badge, 'recycled');
    assert.equal(evaluateFreshness(snapshot({ text: 'BREAKING: no card date here' }), { now: NOW }), null);
  });

  it('does not flag an old link that is not framed as news', () => {
    assert.equal(at('2020-01-15T12:00:00.000Z', { text: 'Filed this in my notes for class.', cardText: 'Class notes' }), null);
  });

  it('parses month names and ISO dates and refuses slash dates', () => {
    assert.equal(new Date(parseVisibleDate('October 1, 2026')).toISOString(), '2026-10-01T00:00:00.000Z');
    assert.equal(new Date(parseVisibleDate('Published 2026-10-01T12:00:00Z')).toISOString(), '2026-10-01T12:00:00.000Z');
    assert.equal(parseVisibleDate('01/11/2020'), null);
    assert.equal(parseVisibleDate(''), null);
  });
});

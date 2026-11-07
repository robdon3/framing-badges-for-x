import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateUrgency, isMostlyCaps } from '../../extension/rules/urgency.js';
import { snapshot } from '../helpers.js';

describe('urgency', () => {
  it('flags BREAKING with no link and no named source', () => {
    const hit = evaluateUrgency(snapshot({ text: '🚨 BREAKING: the grid is down' }));
    assert.equal(hit.badge, 'alarm');
    assert.match(hit.why, /BREAKING/);
    assert.match(hit.why, /siren or alarm emoji/);
  });

  it('flags JUST IN and mostly-caps text', () => {
    assert.equal(evaluateUrgency(snapshot({ text: 'JUST IN: the pier is closed for the night.' })).badge, 'alarm');
    const caps = 'THE CITY LOST POWER AFTER THE STORM HIT HARD';
    assert.equal(isMostlyCaps(caps), true);
    assert.equal(isMostlyCaps('BREAKING'), false);
    assert.equal(evaluateUrgency(snapshot({ text: caps })).badge, 'alarm');
  });

  it('does not treat just in time as news urgency', () => {
    assert.equal(evaluateUrgency(snapshot({ text: 'I arrived just in time for the vote.' })), null);
    assert.equal(evaluateUrgency(snapshot({ text: 'Pack a bag just in case.' })), null);
  });

  it('does not flag when there is a link or a named source', () => {
    assert.equal(evaluateUrgency(snapshot({ text: 'BREAKING: the grid is down', hasLink: true })), null);
    assert.equal(evaluateUrgency(snapshot({ text: 'BREAKING: @citypower confirmed the grid is down' })), null);
    assert.equal(evaluateUrgency(snapshot({ text: 'BREAKING: Reuters confirmed the grid is down' })), null);
    assert.equal(evaluateUrgency(snapshot({ text: 'BREAKING: according to Mayor Adams the grid is down' })), null);
    assert.equal(evaluateUrgency(snapshot({ text: 'THE CITY LOST POWER AFTER REUTERS CONFIRMED THE STORM' })), null);
  });

  it('does not treat anonymous officials as a named source', () => {
    const hit = evaluateUrgency(snapshot({ text: 'BREAKING: officials claim the grid is down' }));
    assert.equal(hit.badge, 'alarm');
  });

  it('leaves an ordinary sentence alone', () => {
    assert.equal(evaluateUrgency(snapshot({ text: 'Here is the meeting agenda for Thursday.' })), null);
  });
});

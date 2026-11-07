import { evaluateAttribution } from './attribution.js';
import { evaluateBait } from './bait.js';
import { evaluateFreshness } from './freshness.js';
import { evaluateNumbers } from './numbers.js';
import { evaluateUrgency } from './urgency.js';

export const RULES = [
  { id: 'urgency', evaluate: evaluateUrgency },
  { id: 'attribution', evaluate: evaluateAttribution },
  { id: 'freshness', evaluate: evaluateFreshness },
  { id: 'bait', evaluate: evaluateBait },
  { id: 'numbers', evaluate: evaluateNumbers },
];

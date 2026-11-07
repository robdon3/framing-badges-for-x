export function snapshot(overrides = {}) {
  const text = overrides.text ?? '';
  const cardText = overrides.cardText ?? '';
  return {
    id: '1',
    text,
    cardText,
    articleDateISO: null,
    postDateISO: '2026-11-07T12:00:00.000Z',
    hasLink: false,
    links: [],
    authorHandle: 'someone',
    authorName: 'Someone',
    mentions: [],
    ...overrides,
    text,
    cardText,
    fullText: overrides.fullText ?? [text, cardText].filter(Boolean).join('\n'),
  };
}

export function installObservers() {
  globalThis.IntersectionObserver = class {
    static instances = [];

    constructor(callback, options = {}) {
      this.callback = callback;
      this.root = options.root ?? null;
      this.options = options;
      globalThis.IntersectionObserver.instances.push(this);
    }

    observe(target) {
      this.callback([{ isIntersecting: true, target }]);
    }

    unobserve() {}

    disconnect() {}
  };

  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      globalThis.MutationObserver.latest = this;
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {
      this.disconnected = true;
    }

    takeRecords() {
      return [];
    }
  };
}

export const NOW = new Date('2026-11-07T12:00:00.000Z');

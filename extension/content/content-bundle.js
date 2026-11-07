(() => {
  // extension/content/async-check.js
  var asyncCheckers = [];
  function registerAsyncChecker(fn) {
    if (typeof fn !== "function") {
      throw new TypeError("An async checker must be a function.");
    }
    asyncCheckers.push(fn);
    return () => {
      const index = asyncCheckers.indexOf(fn);
      if (index >= 0) asyncCheckers.splice(index, 1);
    };
  }

  // extension/tone/protocol.js
  var TONE_TEXT_LIMIT = 1e3;
  var TONE_MESSAGE_TYPE = "fcb-tone";
  var FALLBACK_TONE = "neutral";
  var TONE_NAME_MAX = 24;
  var TONE_LIST_MAX = 12;
  var DEFAULT_TONE_LABELS = Object.freeze([
    "whining",
    "fun",
    "sad",
    "angry",
    "hype",
    "sarcastic",
    "informative",
    "neutral"
  ]);
  var TONE_NAME_CHARS = /[\u0000-\u001F\u007F\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;
  var TONE_OFF_STATUS = Object.freeze({ code: "off", message: "Tone check is off." });
  var TONE_PAGE_PORT = "fcb-tone-page";
  var TONE_ARMED_STATUS = Object.freeze({
    code: "armed",
    message: "Tone check is on. It runs on this Mac when a post stays on screen."
  });
  var TONE_IDLE_STATUS = Object.freeze({
    code: "idle",
    message: "Tone check is on. The on-device model is idle."
  });
  var TONE_CONNECTING_STATUS = Object.freeze({
    code: "connecting",
    message: "Tone check is on. It runs on this Mac when a post stays on screen."
  });
  var TONE_CONNECTED_STATUS = Object.freeze({
    code: "connected",
    message: "Tone check is on. The Apple model runs on this Mac. Nothing is sent over the network."
  });
  var TONE_MISSING_STATUS = Object.freeze({
    code: "missing",
    message: "Tone host not installed"
  });
  var STATUS_CODES = /* @__PURE__ */ new Set(["off", "armed", "idle", "connecting", "connected", "missing", "unavailable", "error"]);
  var GENERIC_TONE_ERROR = "The on-device model could not classify this post.";
  var FIXED_TONE_MESSAGES = Object.freeze(/* @__PURE__ */ new Set([
    TONE_OFF_STATUS.message,
    TONE_ARMED_STATUS.message,
    TONE_IDLE_STATUS.message,
    TONE_CONNECTING_STATUS.message,
    TONE_CONNECTED_STATUS.message,
    TONE_MISSING_STATUS.message,
    GENERIC_TONE_ERROR,
    "Post text is empty.",
    "Apple on-device model is unavailable: this Mac is not eligible.",
    "Apple on-device model is unavailable: Apple Intelligence is turned off.",
    "Apple on-device model is unavailable: the model is not ready yet.",
    "Apple on-device model is unavailable.",
    "Tone host disconnected.",
    "Tone host timed out."
  ]));
  var STRIPPED_CHARS = /[\u0000-\u001F\u007F\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
  function normalizeToneName(raw) {
    const text = String(raw ?? "").replace(/’/g, "'");
    if (TONE_NAME_CHARS.test(text)) return null;
    const value = text.trim().toLowerCase().replace(/[ \t]+/g, " ");
    if (!value || [...value].length > TONE_NAME_MAX) return null;
    if (!/^[a-z0-9]+(?:[ '\-][a-z0-9]+)*$/.test(value)) return null;
    return value;
  }
  function normalizeToneList(raw) {
    if (!Array.isArray(raw)) return [...DEFAULT_TONE_LABELS];
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const item of raw) {
      const name = normalizeToneName(item);
      if (!name || name === FALLBACK_TONE || seen.has(name)) continue;
      if (out.length >= TONE_LIST_MAX) continue;
      seen.add(name);
      out.push(name);
    }
    out.push(FALLBACK_TONE);
    return out;
  }
  function hashToneList(raw) {
    const joined = normalizeToneList(raw).join("\n");
    let hash = 2166136261;
    for (let i = 0; i < joined.length; i += 1) {
      hash ^= joined.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
  function normalizeToneLabel(label, list) {
    const name = normalizeToneName(label);
    if (!name) return null;
    return normalizeToneList(list).includes(name) ? name : null;
  }
  function toneDisplayName(label, list) {
    const name = normalizeToneName(label);
    if (!name) return null;
    if (list !== void 0 && !normalizeToneList(list).includes(name)) return null;
    return name.replace(/(^|[\s-])([a-z0-9])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
  }
  function normalizeToneError(error) {
    const text = String(error ?? "").replace(/\s+/g, " ").trim();
    if (FIXED_TONE_MESSAGES.has(text)) return text;
    if (/not found|forbidden|specified native messaging host/i.test(text)) return TONE_MISSING_STATUS.message;
    return GENERIC_TONE_ERROR;
  }
  function sanitizeToneText(text) {
    let value = String(text ?? "").replace(STRIPPED_CHARS, "");
    const delimiters = /\[\[\/?\s*POST\s*\]\]|<<<\/?\s*POST\s*>>>|<\/?\s*post\s*>/gi;
    for (let pass = 0; pass < 4; pass += 1) {
      delimiters.lastIndex = 0;
      const next = value.replace(delimiters, " ");
      if (next === value) break;
      value = next;
    }
    value = value.replace(/[ \t]{2,}/g, " ").trim();
    return [...value].slice(0, TONE_TEXT_LIMIT).join("");
  }
  function truncateToneText(text) {
    return sanitizeToneText(text);
  }
  function frameToneRequest(id, text, labels) {
    return {
      id: id == null ? "" : String(id),
      text: truncateToneText(text),
      labels: normalizeToneList(labels)
    };
  }
  function parseHostMessage(message, labels) {
    if (!message || typeof message !== "object") {
      return { id: "", error: "Tone host disconnected." };
    }
    const id = message.id == null ? "" : String(message.id);
    if (message.error) {
      return { id, error: normalizeToneError(message.error) };
    }
    const allowed = normalizeToneList(labels === void 0 ? void 0 : labels);
    const name = normalizeToneName(message.label);
    const label = name && allowed.includes(name) ? name : FALLBACK_TONE;
    const ms = Number(message.ms);
    return {
      id,
      label,
      ms: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : null
    };
  }
  function normalizeToneStatus(raw) {
    const code = STATUS_CODES.has(raw?.code) ? raw.code : "off";
    const message = String(raw?.message || "").replace(/\s+/g, " ").trim();
    if (FIXED_TONE_MESSAGES.has(message)) return { code, message };
    if (code === "connected") return { code, message: TONE_CONNECTED_STATUS.message };
    if (code === "armed" || code === "connecting") return { code, message: TONE_ARMED_STATUS.message };
    if (code === "idle") return { code, message: TONE_IDLE_STATUS.message };
    if (code === "missing") return { code, message: TONE_MISSING_STATUS.message };
    if (code === "unavailable") return { code, message: "Apple on-device model is unavailable." };
    if (code === "off") return { code, message: TONE_OFF_STATUS.message };
    return { code, message: "Tone host disconnected." };
  }

  // extension/content/labels.js
  var BADGE_PRECEDENCE = ["claim", "unstamped", "alarm", "recycled", "bait"];
  var BADGE_LABELS = {
    claim: "Claim",
    unstamped: "Unstamped",
    alarm: "Alarm",
    recycled: "Recycled",
    bait: "Bait"
  };
  var DISCLAIMER = "It scores framing, not truth.";
  function pickBadge(hits) {
    const list = Array.isArray(hits) ? hits : [];
    for (const badge of BADGE_PRECEDENCE) {
      if (list.some((hit) => hit && hit.badge === badge)) return badge;
    }
    return null;
  }
  function sortHits(hits) {
    const rank = new Map(BADGE_PRECEDENCE.map((badge, index) => [badge, index]));
    return [...hits].sort((a, b) => (rank.get(a.badge) ?? 99) - (rank.get(b.badge) ?? 99));
  }

  // extension/content/badge.js
  var results = /* @__PURE__ */ new WeakMap();
  var tipSerial = 0;
  function hostOf(article) {
    return [...article.children].find((el) => el.classList?.contains("fcb-host")) || null;
  }
  function authorSentence(author) {
    if (!author?.handle || author.handle === "unknown") {
      return "No author handle was found on this post.";
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
    if (author?.flagCount == null || Number.isNaN(author.flagCount)) return "Flag count unavailable.";
    const handle = author.handle && author.handle !== "unknown" ? `@${author.handle}` : "this author";
    return `Flags recorded for ${handle} in this browser: ${author.flagCount}.`;
  }
  function fillTooltip(tip, result) {
    const doc = tip.ownerDocument;
    tip.replaceChildren();
    const disclaimer = doc.createElement("p");
    disclaimer.className = "fcb-disclaimer";
    disclaimer.textContent = `${DISCLAIMER} This badge scores how the post is framed. It does not check whether the post is true.`;
    tip.append(disclaimer);
    const showing = doc.createElement("p");
    showing.className = "fcb-showing";
    const label = BADGE_LABELS[result.badge] || result.badge;
    showing.textContent = `Showing ${label}. Precedence: ${BADGE_PRECEDENCE.map((badge) => BADGE_LABELS[badge]).join(", ")}.`;
    tip.append(showing);
    const list = doc.createElement("ul");
    list.className = "fcb-reasons";
    const hits = sortHits(result.hits || []);
    if (hits.length === 0) {
      const item = doc.createElement("li");
      item.textContent = "None of the framing rules matched.";
      list.append(item);
    } else {
      for (const hit of hits) {
        const item = doc.createElement("li");
        const name = BADGE_LABELS[hit.badge] || hit.badge;
        item.textContent = `${name}: ${hit.why}`;
        list.append(item);
      }
    }
    for (const error of result.errors || []) {
      const item = doc.createElement("li");
      item.textContent = error.why;
      list.append(item);
    }
    tip.append(list);
    const author = doc.createElement("p");
    author.className = "fcb-meta";
    author.textContent = `${authorSentence(result.author)} ${countSentence(result.author)}`;
    tip.append(author);
    const asyncSlot = doc.createElement("p");
    asyncSlot.className = "fcb-async";
    asyncSlot.dataset.fcbAsync = "1";
    asyncSlot.textContent = result.asyncNote ? `Model check: ${result.asyncNote}` : "Model check: not run. v1 is rules only, and there is no network permission for one.";
    tip.append(asyncSlot);
  }
  function paint(host, result) {
    const badge = host.querySelector(".fcb-badge");
    const tip = host.querySelector(".fcb-tip");
    const label = BADGE_LABELS[result.badge] || result.badge;
    badge.textContent = label;
    badge.className = `fcb-badge fcb-badge-${result.badge}`;
    badge.setAttribute("aria-label", `Framing: ${label}. ${DISCLAIMER}`);
    host.dataset.fcbBadge = result.badge;
    host.dataset.fcbRules = (result.hits || []).map((hit) => hit.ruleId).join(",");
    fillTooltip(tip, result);
    results.set(host, result);
  }
  function placeTip(badge, tip) {
    const doc = badge.ownerDocument;
    const view = doc.defaultView || globalThis;
    const innerWidth = view.innerWidth || 1024;
    const innerHeight = view.innerHeight || 800;
    if (tip.parentElement !== doc.body) doc.body.append(tip);
    tip.classList.add("fcb-tip-portal");
    const rect = badge.getBoundingClientRect();
    const width = Math.min(320, Math.max(220, innerWidth - 16));
    tip.style.display = "block";
    tip.style.position = "fixed";
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
      tip.style.display = "none";
    };
    badge.addEventListener("mouseenter", show);
    badge.addEventListener("mouseleave", hide);
    badge.addEventListener("focus", show);
    badge.addEventListener("blur", hide);
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    for (const type of ["click", "mousedown", "pointerdown", "mouseup"]) {
      badge.addEventListener(type, stop);
    }
    badge.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") stop(event);
    });
  }
  function ensurePositioned(article) {
    const inline = article.style?.position;
    if (inline && inline !== "static") return;
    let computed = "";
    try {
      const view = article.ownerDocument?.defaultView;
      computed = view?.getComputedStyle?.(article)?.position || "";
    } catch {
      computed = "";
    }
    if (computed && computed !== "static") return;
    article.dataset.fcbPositioned = "static";
    article.style.position = "relative";
  }
  function mountBadge(article, result) {
    if (!result?.badge) return null;
    if (hostOf(article)) return hostOf(article);
    const doc = article.ownerDocument;
    ensurePositioned(article);
    const host = doc.createElement("div");
    host.className = "fcb-host";
    const badge = doc.createElement("div");
    badge.className = "fcb-badge";
    badge.tabIndex = 0;
    const tip = doc.createElement("div");
    tip.className = "fcb-tip";
    tip.id = `fcb-tip-${tipSerial += 1}`;
    tip.setAttribute("role", "tooltip");
    badge.setAttribute("aria-describedby", tip.id);
    host.append(badge, tip);
    article.insertBefore(host, article.firstChild);
    const width = article.getBoundingClientRect?.().width || 0;
    if (width > 0 && width < 420) host.classList.add("fcb-host-narrow");
    bindTip(badge, tip);
    paint(host, result);
    return host;
  }
  function ensureBadgeElements(host) {
    if (host.querySelector(".fcb-badge")) return;
    const doc = host.ownerDocument;
    const badge = doc.createElement("div");
    badge.className = "fcb-badge";
    badge.tabIndex = 0;
    const tip = doc.createElement("div");
    tip.className = "fcb-tip";
    tip.id = `fcb-tip-${tipSerial += 1}`;
    tip.setAttribute("role", "tooltip");
    badge.setAttribute("aria-describedby", tip.id);
    host.prepend(badge, tip);
    bindTip(badge, tip);
  }
  function mountToneHost(article) {
    const existing = hostOf(article);
    if (existing) return existing;
    const doc = article.ownerDocument;
    ensurePositioned(article);
    const host = doc.createElement("div");
    host.className = "fcb-host";
    article.insertBefore(host, article.firstChild);
    const width = article.getBoundingClientRect?.().width || 0;
    if (width > 0 && width < 420) host.classList.add("fcb-host-narrow");
    results.set(host, {
      badge: null,
      hits: [],
      errors: [],
      author: { handle: "unknown", flagCount: 0 },
      asyncNote: null
    });
    return host;
  }
  function paintTone(host, tone) {
    const existing = host.querySelector(".fcb-tone");
    const label = normalizeToneName(tone?.label);
    const name = toneDisplayName(label);
    if (!name) {
      existing?.remove();
      if (host.dataset) delete host.dataset.fcbTone;
      return;
    }
    const doc = host.ownerDocument;
    const chip = existing || doc.createElement("span");
    chip.className = "fcb-tone";
    chip.textContent = name;
    const description = `Tone: ${name}. On-device label from this Mac. It is not a framing score and it is not a fact check.`;
    chip.title = description;
    chip.setAttribute("aria-label", description);
    if (!existing) {
      const badge = host.querySelector(".fcb-badge");
      if (badge) badge.after(chip);
      else host.prepend(chip);
    }
    if (host.dataset) host.dataset.fcbTone = label;
  }
  function applyAsyncResult(article, asyncResult) {
    let host = hostOf(article);
    const previous = host ? results.get(host) : null;
    const extraHits = (asyncResult?.hits || []).filter((hit) => hit?.badge);
    const note = asyncResult?.note || asyncResult?.detail || "";
    const hits = [...previous?.hits || [], ...extraHits];
    const badge = pickBadge(hits);
    const toneLabel = asyncResult && Object.prototype.hasOwnProperty.call(asyncResult, "tone") ? toneDisplayName(asyncResult.tone?.label) : null;
    if (!host) {
      if (!badge && !toneLabel) return null;
      if (badge) {
        host = mountBadge(article, {
          badge,
          hits,
          errors: previous?.errors || [],
          author: previous?.author || { handle: "unknown", flagCount: 0 },
          asyncNote: note || (extraHits.length ? "Extra result attached." : null)
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
        author: previous?.author || { handle: "unknown", flagCount: 0 },
        asyncNote: note || (extraHits.length ? "Extra result attached." : previous?.asyncNote || null)
      };
      paint(host, next);
    }
    if (!host) return null;
    if (asyncResult && Object.prototype.hasOwnProperty.call(asyncResult, "tone")) paintTone(host, asyncResult.tone);
    if (!host.querySelector(".fcb-badge") && !host.querySelector(".fcb-tone")) {
      host.remove();
      return null;
    }
    return results.get(host) || { badge: badge || null, hits };
  }
  function hideOpenTips(doc) {
    doc.querySelectorAll(".fcb-tip").forEach((tip) => {
      tip.style.display = "none";
    });
  }

  // extension/rules/text.js
  function postText(snapshot) {
    if (!snapshot) return "";
    const raw = typeof snapshot.fullText === "string" ? snapshot.fullText : `${snapshot.text || ""}${snapshot.cardText ? `
${snapshot.cardText}` : ""}`;
    return raw.replace(/[’‘]/g, "'");
  }

  // extension/rules/freshness.js
  var FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1e3;
  var NEWS_FRAME_RE = /\b(breaking|developing|happening\s+now|latest|urgent|tonight|this\s+morning|this\s+afternoon|this\s+evening|right\s+now|new\s+report|exclusive|just\s+announced)\b|\bjust\s+in\b(?!\s+(?:time|case|for)\b)/i;
  var MONTHS = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sept: 8,
    sep: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11
  };
  function utc(year, month, day) {
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    const ms = Date.UTC(year, month, day);
    const check = new Date(ms);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) {
      return null;
    }
    return ms;
  }
  function parseVisibleDate(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}(?:[t\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)?$/i.test(text)) {
      const ms = Date.parse(text);
      return Number.isNaN(ms) ? null : ms;
    }
    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:z|utc)?)?\b/i);
    if (iso) {
      const ms = Date.UTC(
        Number(iso[1]),
        Number(iso[2]) - 1,
        Number(iso[3]),
        iso[4] ? Number(iso[4]) : 0,
        iso[5] ? Number(iso[5]) : 0,
        iso[6] ? Number(iso[6]) : 0
      );
      return Number.isNaN(ms) ? null : ms;
    }
    const monthFirst = text.match(/\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})\b/i);
    if (monthFirst) {
      return utc(Number(monthFirst[3]), MONTHS[monthFirst[1].toLowerCase()], Number(monthFirst[2]));
    }
    const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?(?:,)?\s+(\d{4})\b/i);
    if (dayFirst) {
      return utc(Number(dayFirst[3]), MONTHS[dayFirst[2].toLowerCase()], Number(dayFirst[1]));
    }
    return null;
  }
  function isNewsFramed(text) {
    return NEWS_FRAME_RE.test(text || "");
  }
  function evaluateFreshness(snapshot, context = {}) {
    if (!snapshot?.articleDateISO) return null;
    const articleMs = Date.parse(snapshot.articleDateISO);
    if (Number.isNaN(articleMs)) return null;
    const postMs = snapshot.postDateISO ? Date.parse(snapshot.postDateISO) : NaN;
    const nowMs = context.now ? new Date(context.now).getTime() : Date.now();
    const reference = Number.isNaN(postMs) ? nowMs : postMs;
    const age = reference - articleMs;
    if (!(age > FORTY_EIGHT_HOURS_MS)) return null;
    if (!isNewsFramed(postText(snapshot))) return null;
    const hours = Math.round(age / 36e5);
    const compared = Number.isNaN(postMs) ? "the current clock" : "the post time";
    return {
      ruleId: "freshness",
      badge: "recycled",
      summary: "Old link framed as news",
      why: `The visible linked date ${snapshot.articleDateISO} is about ${hours} hours before ${compared}, past 48 hours, and the post still frames it as news. No date was guessed.`
    };
  }

  // extension/content/selectors.js
  var SELECTORS = {
    post: 'article[data-testid="tweet"]',
    postFallback: 'article[role="article"]',
    tweetText: '[data-testid="tweetText"], [data-testid="tweet-text"]',
    userName: '[data-testid="User-Name"], [data-testid="user-name"]',
    statusTime: 'a[href*="/status/"] time[datetime]',
    card: '[data-testid="card.wrapper"], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"], [data-testid="card.layoutLarge.detail"]',
    avatar: '[data-testid="Tweet-User-Avatar"], [data-testid="tweet-avatar"]',
    column: '[data-testid="column"]',
    columnScroll: '[data-testid="columnContent"]'
  };
  function columnScrollRoot(post) {
    const scroller = post.closest?.(SELECTORS.columnScroll);
    if (scroller) return scroller;
    return post.closest?.(SELECTORS.column) || null;
  }
  function findPosts(root) {
    if (!root?.querySelectorAll) return [];
    const found = /* @__PURE__ */ new Set();
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

  // extension/content/extract.js
  var MEDIA_HOSTS = /* @__PURE__ */ new Set(["pbs.twimg.com", "video.twimg.com", "abs.twimg.com"]);
  function visibleText(el) {
    if (!el) return "";
    const parts = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        parts.push(node.nodeValue || "");
        return;
      }
      if (node.nodeType !== 1 || node.tagName === "IMG") return;
      const block = /^(DIV|P|LI|H1|H2|H3|TR|SECTION|ARTICLE|TIME|BR)$/.test(node.tagName);
      if (block) parts.push("\n");
      for (const child of node.childNodes) walk(child);
      if (block) parts.push("\n");
    };
    walk(el);
    return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
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
  function isSourceLink(href) {
    if (!href) return false;
    const raw = String(href).trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:") || raw.startsWith("mailto:")) return false;
    let url;
    try {
      url = new URL(raw, "https://x.com");
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^www\./, "");
    const onX = host === "x.com" || host === "twitter.com";
    const path = url.pathname || "/";
    if (MEDIA_HOSTS.has(url.hostname)) return false;
    if (!onX) return true;
    if (/^\/[A-Za-z0-9_]{1,15}\/?$/.test(path)) return false;
    if (path.includes("/status/")) return false;
    if (path.startsWith("/hashtag/") || path.startsWith("/search") || path.startsWith("/i/")) return false;
    if (/\/(?:photo|video)\//.test(path)) return false;
    return true;
  }
  function textHasUrl(text) {
    return /\bhttps?:\/\/\S+/i.test(text) || /\b(?:t\.co|bit\.ly|tinyurl\.com)\/\S+/i.test(text) || /\b[a-z0-9.-]+\.[a-z]{2,}\/\S+/i.test(text);
  }
  function altsWithin(nodes, article) {
    const bits = [];
    for (const node of nodes) {
      node.querySelectorAll('img[alt], [role="img"][aria-label]').forEach((el) => {
        if (el.closest(SELECTORS.avatar)) return;
        const value = el.getAttribute("alt") || el.getAttribute("aria-label") || "";
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
    const time = scope.querySelector("time[datetime]");
    if (time?.getAttribute("datetime")) {
      const parsed = Date.parse(time.getAttribute("datetime"));
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
    return isoFromMs(parseVisibleDate(visibleText(scope)));
  }
  function extractAuthor(article) {
    const box = article.querySelector(SELECTORS.userName);
    const scope = box || article;
    let handle = "";
    const handleNode = [...scope.querySelectorAll("span, a")].find((el) => /^@[A-Za-z0-9_]{1,15}$/.test((el.textContent || "").trim()));
    if (handleNode) handle = handleNode.textContent.trim().slice(1);
    if (!handle) {
      const link = scope.querySelector('a[href^="/"]');
      const match = (link?.getAttribute("href") || "").match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (match) handle = match[1];
    }
    let name = "";
    if (box) {
      name = [...box.querySelectorAll("span")].map((el) => (el.textContent || "").trim()).find((value) => value && !value.startsWith("@") && value !== "\xB7") || "";
    }
    return { authorHandle: handle, authorName: name };
  }
  function extractPostDate(article) {
    const time = article.querySelector(SELECTORS.statusTime);
    const attr = time?.getAttribute("datetime");
    if (!attr) return null;
    const ms = Date.parse(attr);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  function extractArticleDate(article) {
    const cards = topMatches(article, SELECTORS.card);
    for (const card of cards) {
      const found = dateIn(card);
      if (found) return found;
    }
    const textRoot = article.querySelector(SELECTORS.tweetText);
    if (!textRoot) return null;
    for (const link of textRoot.querySelectorAll("a[href]")) {
      if (!isSourceLink(link.getAttribute("href"))) continue;
      const found = dateIn(link);
      if (found) return found;
    }
    return null;
  }
  function extractId(article, authorHandle, text) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      const match = (link.getAttribute("href") || "").match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return `h-${fnv(`${authorHandle}|${text.slice(0, 200)}`)}`;
  }
  function extractPost(article) {
    const textNodes = topMatches(article, SELECTORS.tweetText);
    const cardNodes = topMatches(article, SELECTORS.card);
    const text = textNodes.map(visibleText).filter(Boolean).join("\n");
    const cardText = cardNodes.map(visibleText).filter(Boolean).join("\n");
    const alt = [...altsWithin(textNodes, article), ...altsWithin(cardNodes, article)].join(" ");
    const textWithAlt = [text, alt].filter(Boolean).join(" ");
    const fullText = [textWithAlt, cardText].filter(Boolean).join("\n");
    const links = [];
    article.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
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
      hasLink: links.length > 0 || textHasUrl(`${text}
${cardText}`),
      links,
      mentions,
      ...author
    };
  }

  // extension/rules/attribution.js
  var SKIP_NAME = /* @__PURE__ */ new Set([
    "he",
    "she",
    "they",
    "we",
    "i",
    "you",
    "it",
    "this",
    "that",
    "there",
    "what",
    "who",
    "which",
    "these",
    "those",
    "someone",
    "somebody",
    "anyone",
    "anybody",
    "everyone",
    "everybody",
    "people",
    "nobody",
    "one",
    "some",
    "many",
    "others",
    "few",
    "both",
    "each",
    "all",
    "none",
    "nothing",
    "something",
    "users",
    "folks",
    "sources",
    "source",
    "officials",
    "official",
    "reports",
    "report",
    "authorities",
    "authority",
    "insiders",
    "insider",
    "witnesses",
    "witness"
  ]);
  var PATTERNS = [
    { label: "reportedly", re: /\breportedly\b/i },
    { label: "allegedly", re: /\ballegedly\b/i },
    { label: "purportedly", re: /\bpurportedly\b/i },
    { label: "sources say", re: /\bsources?\s+(?:say|said|claim|claims|claimed)\b/i },
    { label: "officials claim", re: /\bofficials?\s+(?:say|said|claim|claims|claimed)\b/i },
    { label: "authorities say", re: /\bauthorities\s+(?:say|said|claim|claims|claimed)\b/i },
    { label: "according to sources", re: /\baccording\s+to\s+(?:sources|officials|reports|a\s+report)\b/i },
    { label: "people familiar with", re: /\b(?:people|persons)\s+familiar\s+with\b/i },
    { label: "reports say", re: /\breports?\s+say\b/i }
  ];
  var NAME_SAYS = /\b([A-Z][\p{L}'’.-]{1,40}(?:\s+[A-Z][\p{L}'’.-]{1,40}){0,3})\s+(says|said|claims|claimed)\b/gu;
  function findClaimPhrases(text) {
    const found = [];
    const seen = /* @__PURE__ */ new Set();
    const push = (label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      found.push(label);
    };
    for (const pattern of PATTERNS) {
      if (pattern.re.test(text)) push(pattern.label);
    }
    for (const match of text.matchAll(NAME_SAYS)) {
      const first = match[1].split(/\s+/)[0].toLowerCase();
      if (SKIP_NAME.has(first)) continue;
      push(`${match[1]} ${match[2].toLowerCase()}`);
    }
    return found;
  }
  function evaluateAttribution(snapshot) {
    const phrases = findClaimPhrases(postText(snapshot));
    if (phrases.length === 0) return null;
    const catalog = new Set(PATTERNS.map((pattern) => pattern.label.toLowerCase()));
    const listed = phrases.filter((phrase) => catalog.has(phrase.toLowerCase())).slice(0, 4);
    const why = listed.length ? `Attribution language, not a checked fact: ${listed.map((phrase) => `\u201C${phrase}\u201D`).join(", ")}.` : "Attribution language, not a checked fact.";
    return {
      ruleId: "attribution",
      badge: "claim",
      summary: "One-sided attribution",
      why
    };
  }

  // extension/rules/lexicon.js
  var LEXICON = {
    disgusting: -3.4,
    disgusted: -2.6,
    disgust: -2.8,
    outrageous: -3.2,
    outrage: -2.6,
    outraged: -2.8,
    corrupt: -2.7,
    corruption: -2.6,
    lying: -2.8,
    liar: -3,
    liars: -3,
    lied: -2.4,
    scum: -3.6,
    evil: -3.2,
    vile: -3.2,
    sickening: -3.1,
    shameful: -2.7,
    disgrace: -2.8,
    disgraceful: -2.9,
    horrific: -3,
    horrifying: -3,
    terrible: -2.4,
    horrible: -2.6,
    awful: -2.3,
    worst: -2.5,
    hate: -2.7,
    hateful: -2.6,
    idiot: -2.7,
    idiots: -2.7,
    stupid: -2.3,
    moron: -2.9,
    morons: -2.9,
    pathetic: -2.5,
    coward: -2.4,
    cowards: -2.4,
    traitor: -3.1,
    traitors: -3.1,
    treason: -3,
    fraud: -2.6,
    fraudulent: -2.5,
    hoax: -2.3,
    propaganda: -2.2,
    brainwashed: -2.5,
    sheeple: -2.4,
    rigged: -2.3,
    criminal: -2.3,
    criminals: -2.4,
    vicious: -2.4,
    cruel: -2.3,
    abhorrent: -3,
    appalling: -2.8,
    monstrous: -3,
    despicable: -3.1,
    rotten: -2.2,
    furious: -2.6,
    fury: -2.3,
    enraged: -2.6,
    rage: -2.2,
    raging: -2.2,
    gross: -2,
    nasty: -2.1,
    filth: -2.6,
    filthy: -2.5,
    scumbag: -3.4,
    bastard: -2.6,
    bastards: -2.6,
    bullshit: -2.4,
    crooked: -2.4,
    crook: -2.4,
    crooks: -2.5,
    deplorable: -2.6,
    unforgivable: -2.7,
    wicked: -2.4,
    malicious: -2.5,
    manipulative: -2.2,
    gaslighting: -2.4,
    betrayal: -2.5,
    betrayed: -2.4,
    hypocrite: -2.4,
    hypocrites: -2.4,
    hypocrisy: -2.2,
    shameless: -2.5,
    scandalous: -2.2,
    incompetent: -2,
    illegitimate: -2,
    thieves: -2.3,
    thief: -2.3,
    robbed: -2,
    bloodbath: -2.8,
    massacre: -2.6,
    genocide: -3.2,
    murderer: -2.8,
    murderers: -2.8,
    terrorist: -2.7,
    terrorists: -2.7,
    terrorism: -2.5,
    toxic: -2,
    murder: -2.4,
    embarrassing: -1.8,
    catastrophe: -1.9,
    disaster: -1.9,
    crisis: -1.5,
    bad: -1.7,
    worse: -1.8,
    angry: -1.9,
    anger: -1.8,
    sad: -1.5,
    annoying: -1.5,
    ridiculous: -1.9,
    insane: -1.7,
    nonsense: -1.6,
    shocking: -1.8,
    scandal: -1.9,
    illegal: -1.6,
    violent: -1.8,
    violence: -1.7,
    good: 1.9,
    great: 2.6,
    excellent: 3.1,
    amazing: 2.8,
    love: 2.7,
    loved: 2.4,
    wonderful: 2.9,
    honest: 2,
    truth: 1.4,
    true: 1.2,
    best: 2.3,
    happy: 2.2,
    glad: 1.8,
    fantastic: 2.9,
    beautiful: 2.4,
    brave: 2.1,
    brilliant: 2.5,
    helpful: 1.8,
    kind: 1.8,
    fair: 1.5,
    hope: 1.6,
    hopeful: 1.7,
    thanks: 1.7,
    grateful: 2,
    winner: 1.6,
    safe: 1.3,
    peace: 1.8,
    nice: 1.6,
    awesome: 2.7,
    perfect: 2.5,
    funny: 1.6,
    proud: 1.8,
    impressive: 2.1,
    clear: 0.8,
    useful: 1.4,
    solid: 1.2,
    win: 1.5,
    thank: 1.6,
    justice: 1.4
  };

  // extension/rules/bait.js
  var OUTRAGE_MIN_STRONG = 3;
  var OUTRAGE_STRONG_FLOOR = 2;
  var OUTRAGE_COMPOUND = -0.7;
  var BOOSTERS = {
    very: 0.293,
    extremely: 0.4,
    really: 0.293,
    so: 0.293,
    incredibly: 0.35,
    utterly: 0.4,
    highly: 0.25,
    totally: 0.35,
    absolutely: 0.35,
    completely: 0.35,
    remarkably: 0.3,
    particularly: 0.2,
    especially: 0.2,
    enormously: 0.4
  };
  var DAMPENERS = {
    barely: 0.293,
    slightly: 0.293,
    somewhat: 0.2,
    kinda: 0.2,
    marginally: 0.2
  };
  var NEGATIONS = /* @__PURE__ */ new Set([
    "not",
    "no",
    "never",
    "neither",
    "nor",
    "nothing",
    "nobody",
    "nowhere",
    "cannot",
    "cant",
    "without",
    "hardly",
    "rarely",
    "scarcely"
  ]);
  var BAIT_PHRASES = [
    { label: "RT if", re: /\brt\s+if\b/i },
    { label: "retweet if", re: /\bretweet\s+if\b/i },
    { label: "like if", re: /\blike\s+if\b/i },
    { label: "share if", re: /\bshare\s+if\b/i },
    { label: "nobody is talking about", re: /\b(?:nobody|no\s+one)\s+is\s+talking\s+about\b/i },
    { label: "don't want you to know", re: /\bdon'?t\s+want\s+you\s+to\s+know\b/i },
    { label: "the media won't tell you", re: /\b(?:the\s+)?media\s+(?:won'?t|will\s+not|doesn'?t|do\s+not)\s+(?:tell|show)\s+you\b/i },
    { label: "you won't believe", re: /\byou\s+won'?t\s+believe\b/i },
    { label: "open your eyes", re: /\bopen\s+your\s+eyes\b/i },
    { label: "share this before", re: /\bshare\s+this\s+before\b/i },
    { label: "what they are hiding", re: /\bwhat\s+they(?:'re|\s+are)\s+hiding\b/i },
    { label: "this will be deleted", re: /\bthis\s+will\s+be\s+deleted\b/i },
    { label: "wake up people", re: /\bwake\s+up(?:,)?\s+(?:people|sheeple|america|everyone)\b/i }
  ];
  function tokenize(text) {
    const normalized = text.replace(/[’‘]/g, "'").replace(/\b(can|do|does|did|is|are|was|were|won|would|should|could|must|have|has|had)n't\b/gi, "$1 not").replace(/\bwon't\b/gi, "will not");
    return normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  }
  function scoreSentiment(text) {
    const raw = tokenize(String(text || ""));
    const lower = raw.map((token) => token.toLowerCase());
    const butIndex = lower.lastIndexOf("but");
    let sum = 0;
    let strongNegativeHits = 0;
    const examples = [];
    for (let i = 0; i < raw.length; i += 1) {
      const word = lower[i];
      if (!(word in LEXICON)) continue;
      let valence = LEXICON[word];
      const original = raw[i];
      if (original.length > 1 && original === original.toUpperCase() && /[A-Z]/.test(original)) {
        valence += valence >= 0 ? 0.733 : -0.733;
      }
      for (let distance = 1; distance <= 3; distance += 1) {
        const previous = lower[i - distance];
        if (!previous) break;
        if (NEGATIONS.has(previous)) {
          valence *= -0.74;
          break;
        }
        if (BOOSTERS[previous]) {
          valence += valence < 0 ? -BOOSTERS[previous] : BOOSTERS[previous];
        } else if (DAMPENERS[previous]) {
          valence += valence < 0 ? DAMPENERS[previous] : -DAMPENERS[previous];
        }
      }
      if (butIndex !== -1) valence *= i < butIndex ? 0.5 : 1.5;
      if (valence <= -2) {
        strongNegativeHits += 1;
        if (examples.length < 5) examples.push(word);
      }
      sum += valence;
    }
    const exclaims = (String(text || "").match(/!/g) || []).length;
    if (exclaims && sum !== 0) sum += Math.sign(sum) * Math.min(exclaims, 4) * 0.292;
    const compound = sum === 0 ? 0 : sum / Math.sqrt(sum * sum + 15);
    return {
      compound: Math.round(compound * 1e3) / 1e3,
      strongNegativeHits,
      examples
    };
  }
  function isOutrage(sentiment) {
    return sentiment.strongNegativeHits >= OUTRAGE_MIN_STRONG || sentiment.strongNegativeHits >= OUTRAGE_STRONG_FLOOR && sentiment.compound <= OUTRAGE_COMPOUND;
  }
  function findBaitPhrases(text) {
    return BAIT_PHRASES.filter((phrase) => phrase.re.test(text)).map((phrase) => phrase.label);
  }
  function evaluateBait(snapshot) {
    const text = postText(snapshot);
    const phrases = findBaitPhrases(text);
    const sentiment = scoreSentiment(text);
    const outrage = isOutrage(sentiment);
    if (phrases.length === 0 && !outrage) return null;
    const parts = [];
    if (phrases.length) {
      parts.push(`Engagement phrase: ${phrases.map((phrase) => `\u201C${phrase}\u201D`).join(", ")}.`);
    }
    if (outrage) {
      parts.push(`Outrage lexicon compound ${sentiment.compound.toFixed(2)} from ${sentiment.strongNegativeHits} strong negative words. Sentiment is not evidence.`);
    }
    return {
      ruleId: "bait",
      badge: "bait",
      summary: "Engagement bait or outrage framing",
      why: parts.join(" ")
    };
  }

  // extension/rules/numbers.js
  var PERCENT = /\b\d{1,3}(?:\.\d+)?\s?%/g;
  var DOLLAR = /\$\s?\d+(?:,\d{3})*(?:\.\d+)?/g;
  var AMERICAN = /(?<![A-Za-z0-9])[+-]\d{3,4}\b/g;
  var FRACTIONAL = /\b\d{1,3}\s*(?:\/|to|-)\s*\d{1,3}\b/i;
  var ODDS_WORD = /\bodds\b/i;
  var MARKET = /\b(?:polymarket|kalshi|predictit|metaculus|manifold|betfair|smarkets)\b/i;
  var NUMBER = /\d/;
  var TIMESTAMP = new RegExp(
    [
      "\\b\\d{4}-\\d{2}-\\d{2}(?:[t\\s]\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*z|utc)?)?\\b",
      "\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:a\\.?m\\.?|p\\.?m\\.?|utc|gmt|et|pt|ct|mt|bst|cet)?\\b",
      "\\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b",
      "\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?(?:,?\\s+\\d{4})?\\b",
      "\\b(?:as of|as at|updated|timestamped)\\s+(?:mon|tue|wed|thu|fri|sat|sun)\\w*\\b"
    ].join("|"),
    "ig"
  );
  var NEAR = 48;
  function sentencesOf(text) {
    const parts = [];
    const re = /\n+|(?<=[.!?])\s+/g;
    let last = 0;
    for (const match of text.matchAll(re)) {
      parts.push({ start: last, end: match.index, text: text.slice(last, match.index) });
      last = match.index + match[0].length;
    }
    parts.push({ start: last, end: text.length, text: text.slice(last) });
    return parts;
  }
  function stampSpans(text) {
    const spans = [];
    for (const match of text.matchAll(TIMESTAMP)) {
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
    return spans;
  }
  function sentenceAt(sentences, index) {
    return sentences.find((sentence) => index >= sentence.start && index < sentence.end) || sentences[sentences.length - 1];
  }
  function isStamped(index, length, sentences, stamps) {
    const sentence = sentenceAt(sentences, index);
    if (stamps.some((stamp) => stamp.start < sentence.end && stamp.end > sentence.start)) return true;
    return stamps.some((stamp) => {
      const gap = stamp.start >= index + length ? stamp.start - (index + length) : index - stamp.end;
      return gap <= NEAR && gap >= 0;
    });
  }
  function collect(text, regex, kind) {
    const found = [];
    for (const match of text.matchAll(regex)) {
      found.push({ kind, raw: match[0], index: match.index, length: match[0].length });
    }
    return found;
  }
  function findMarketNumbers(text) {
    const source = String(text || "");
    const sentences = sentencesOf(source);
    const found = [
      ...collect(source, PERCENT, "percent"),
      ...collect(source, DOLLAR, "dollar"),
      ...collect(source, AMERICAN, "american-odds")
    ];
    for (const sentence of sentences) {
      if (ODDS_WORD.test(sentence.text)) {
        const fractional = sentence.text.match(FRACTIONAL);
        if (fractional) {
          found.push({
            kind: "odds",
            raw: fractional[0],
            index: sentence.start + sentence.text.indexOf(fractional[0]),
            length: fractional[0].length
          });
        }
      }
      if (MARKET.test(sentence.text) && NUMBER.test(sentence.text)) {
        const digits = sentence.text.match(/\d+(?:\.\d+)?/);
        if (digits) {
          found.push({
            kind: "market",
            raw: digits[0],
            index: sentence.start + sentence.text.indexOf(digits[0]),
            length: digits[0].length
          });
        }
      }
    }
    return found;
  }
  function uncoveredNumbers(text) {
    const source = String(text || "");
    const sentences = sentencesOf(source);
    const stamps = stampSpans(source);
    const seen = /* @__PURE__ */ new Set();
    const open = [];
    for (const number of findMarketNumbers(source)) {
      const key = `${number.index}:${number.raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!isStamped(number.index, number.length, sentences, stamps)) open.push(number);
    }
    return open;
  }
  function evaluateNumbers(snapshot) {
    const open = uncoveredNumbers(postText(snapshot));
    if (open.length === 0) return null;
    return {
      ruleId: "numbers",
      badge: "unstamped",
      summary: "Number or odds with no as-of time",
      why: "Number or odds with no as-of time. The post time does not date the figure."
    };
  }

  // extension/rules/urgency.js
  var ALARM_EMOJI = /\u{1F6A8}|\u{203C}\uFE0F?|\u{26A0}\uFE0F?|\u{1F198}|\u{1F514}|\u{1F534}|\u{1F4E2}/u;
  var ANONYMOUS = /* @__PURE__ */ new Set([
    "sources",
    "source",
    "officials",
    "official",
    "reports",
    "report",
    "rumors",
    "rumours",
    "rumor",
    "rumour",
    "media",
    "insiders",
    "insider",
    "witnesses",
    "witness",
    "authorities",
    "authority",
    "someone",
    "people"
  ]);
  var OUTLETS = [
    "reuters",
    "associated press",
    "ap news",
    "bbc",
    "cnn",
    "bloomberg",
    "the new york times",
    "new york times",
    "washington post",
    "wall street journal",
    "financial times",
    "the guardian",
    "al jazeera",
    "npr",
    "politico",
    "axios",
    "afp",
    "agence france-presse",
    "abc news",
    "cbs news",
    "nbc news",
    "fox news",
    "the hill",
    "white house",
    "pentagon",
    "supreme court",
    "united nations",
    "european commission"
  ];
  var JUST_IN = /\bjust\s+in\b(?!\s+(?:time|case|for)\b)/i;
  function isMostlyCaps(text) {
    const cleaned = String(text || "").replace(/https?:\/\/\S+/gi, " ").replace(/@\w+/g, " ");
    const words = cleaned.split(/[^A-Za-z]+/).filter((word) => word.length >= 4);
    if (words.length < 4) return false;
    const caps = words.filter((word) => word === word.toUpperCase() && /[A-Z]/.test(word));
    return caps.length / words.length >= 0.6;
  }
  function urgencySignals(text) {
    const signals = [];
    if (/\bbreaking\b/i.test(text)) signals.push("BREAKING");
    if (JUST_IN.test(text)) signals.push("JUST IN");
    if (ALARM_EMOJI.test(text)) signals.push("a siren or alarm emoji");
    if (isMostlyCaps(text)) signals.push("mostly-caps text");
    return signals;
  }
  function mentionsOutlet(text) {
    const lower = text.toLowerCase();
    return OUTLETS.some((outlet) => {
      if (outlet.includes(" ")) return lower.includes(outlet);
      return new RegExp(`\\b${outlet}\\b`, "i").test(text);
    });
  }
  function hasNamedSource(snapshot) {
    const text = postText(snapshot);
    if (/@[A-Za-z0-9_]{1,15}\b/.test(text)) return true;
    if (Array.isArray(snapshot?.mentions) && snapshot.mentions.length > 0) return true;
    if (mentionsOutlet(text)) return true;
    const named = text.matchAll(
      /\baccording\s+to\s+(?:the\s+)?([A-Z][\p{L}0-9&.'’-]+(?:\s+[A-Z][\p{L}0-9&.'’-]+){0,4})/gu
    );
    for (const match of named) {
      const first = match[1].split(/\s+/)[0].toLowerCase();
      if (!ANONYMOUS.has(first)) return true;
    }
    return false;
  }
  function evaluateUrgency(snapshot) {
    const text = postText(snapshot);
    const signals = urgencySignals(text);
    if (signals.length === 0) return null;
    if (snapshot?.hasLink === true) return null;
    if (hasNamedSource(snapshot)) return null;
    return {
      ruleId: "urgency",
      badge: "alarm",
      summary: "Urgency framing without a source",
      why: `Matched ${signals.join(" and ")}. The post has no link and no named source.`
    };
  }

  // extension/rules/index.js
  var RULES = [
    { id: "urgency", evaluate: evaluateUrgency },
    { id: "attribution", evaluate: evaluateAttribution },
    { id: "freshness", evaluate: evaluateFreshness },
    { id: "bait", evaluate: evaluateBait },
    { id: "numbers", evaluate: evaluateNumbers }
  ];

  // extension/rules/sources.js
  function normalizeHandle(value) {
    let text = String(value || "").trim().replace(/^@+/, "");
    const url = text.match(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/?$/i);
    if (url) text = url[1];
    return text.toLowerCase();
  }
  function authorKey(handle) {
    return normalizeHandle(handle) || "unknown";
  }
  function classifyAuthor(handle, context = {}) {
    const key = authorKey(handle);
    const trustedList = context.trustedHandles || [];
    const noisyList = context.noisyHandles || [];
    const trusted = key !== "unknown" && trustedList.includes(key);
    const noisy = key !== "unknown" && noisyList.includes(key);
    let list = "unlisted";
    if (trusted && noisy) list = "both";
    else if (trusted) list = "trusted";
    else if (noisy) list = "noisy";
    return { handle: key, list, trusted, noisy };
  }

  // extension/content/scorer.js
  function scorePost(snapshot, context = {}) {
    const hits = [];
    const errors = [];
    for (const rule of RULES) {
      try {
        const hit = rule.evaluate(snapshot, context);
        if (hit?.badge) hits.push(hit);
      } catch {
        errors.push({
          ruleId: rule.id,
          badge: null,
          summary: "Rule error",
          why: `${rule.id} failed open and was skipped.`
        });
      }
    }
    return finalize(snapshot, hits, context, errors);
  }
  function finalize(snapshot, hits, context, errors) {
    const author = classifyAuthor(snapshot?.authorHandle, context);
    const flagCount = context.authorFlagCounts?.[authorKey(snapshot?.authorHandle)] ?? 0;
    return {
      badge: pickBadge(hits),
      hits,
      errors,
      author: { ...author, flagCount },
      snapshotId: snapshot?.id || "",
      asyncNote: null
    };
  }

  // extension/tone/filter.js
  function ensurePositioned2(article) {
    const inline = article.style?.position;
    if (inline && inline !== "static") return;
    let computed = "";
    try {
      computed = article.ownerDocument?.defaultView?.getComputedStyle?.(article)?.position || "";
    } catch {
      computed = "";
    }
    if (computed && computed !== "static") return;
    if (article.dataset) article.dataset.fcbPositioned = "static";
    article.style.position = "relative";
  }
  function normalizeHiddenTones(raw, labels) {
    const allowed = normalizeToneList(labels).filter((name) => name !== FALLBACK_TONE);
    const selected = /* @__PURE__ */ new Set();
    const values = Array.isArray(raw) ? raw : [];
    for (const value of values) {
      const name = normalizeToneName(value);
      if (name && allowed.includes(name)) selected.add(name);
    }
    return allowed.filter((name) => selected.has(name));
  }
  function shouldCollapsePost({ label, hiddenTones, revealed, postId, labels } = {}) {
    const normalized = normalizeToneName(label);
    if (!normalized || normalized === FALLBACK_TONE) return false;
    if (revealed?.has(String(postId || ""))) return false;
    return normalizeHiddenTones(hiddenTones, labels).includes(normalized);
  }
  function hiddenBar(article) {
    return [...article.children].find((el) => el.classList?.contains("fcb-hidden-bar")) || null;
  }
  function syncPostCollapse(article, { label, hiddenTones, revealed, postId, onShow, labels } = {}) {
    if (!article) return false;
    const collapse = shouldCollapsePost({ label, hiddenTones, revealed, postId, labels });
    const bar = hiddenBar(article);
    if (!collapse) {
      if (bar) bar.remove();
      if (article.dataset?.fcbCollapsed) delete article.dataset.fcbCollapsed;
      if (article.classList?.contains("fcb-collapsed")) article.classList.remove("fcb-collapsed");
      return false;
    }
    ensurePositioned2(article);
    if (article.dataset) {
      if (article.dataset.fcbCollapsed !== "1") article.dataset.fcbCollapsed = "1";
    } else if (article.getAttribute?.("data-fcb-collapsed") !== "1") {
      article.setAttribute("data-fcb-collapsed", "1");
    }
    const name = toneDisplayName(label, labels);
    const text = `Hidden: ${name}`;
    if (bar) {
      const labelNode2 = [...bar.children].find((el) => el.classList?.contains("fcb-hidden-label"));
      if (labelNode2 && labelNode2.textContent !== text) labelNode2.textContent = text;
      return true;
    }
    const doc = article.ownerDocument;
    const next = doc.createElement("div");
    next.className = "fcb-hidden-bar";
    const labelNode = doc.createElement("span");
    labelNode.className = "fcb-hidden-label";
    labelNode.textContent = text;
    const show = doc.createElement("button");
    show.type = "button";
    show.className = "fcb-show";
    show.textContent = "Show";
    const stop = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    for (const type of ["click", "mousedown", "pointerdown", "mouseup"]) {
      next.addEventListener(type, stop);
    }
    show.addEventListener("click", (event) => {
      stop(event);
      onShow?.(String(postId || ""));
    });
    next.append(labelNode, show);
    article.insertBefore(next, article.firstChild);
    return true;
  }

  // extension/storage/state.js
  var MAX_HANDLES = 500;
  var COUNTED_ID_CAP = 2e3;
  var STORAGE_KEYS = Object.freeze([
    "trustedHandles",
    "noisyHandles",
    "authorFlagCounts",
    "countedPostIds",
    "toneEnabled",
    "toneLabels",
    "hiddenTones",
    "toneStatus"
  ]);
  var DEFAULT_STATE = {
    trustedHandles: [],
    noisyHandles: [],
    authorFlagCounts: {},
    countedPostIds: [],
    toneEnabled: false,
    toneLabels: normalizeToneList(),
    hiddenTones: [],
    toneStatus: { code: TONE_OFF_STATUS.code, message: TONE_OFF_STATUS.message }
  };
  function uniqueHandles(values) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const value of values || []) {
      const handle = normalizeHandle(value);
      if (!/^[a-z0-9_]{1,15}$/.test(handle) || seen.has(handle)) continue;
      seen.add(handle);
      out.push(handle);
      if (out.length >= MAX_HANDLES) break;
    }
    return out;
  }
  function normalizeState(raw) {
    const authorFlagCounts = {};
    for (const [key, value] of Object.entries(raw?.authorFlagCounts || {})) {
      const handle = authorKey(key);
      const count = Number(value);
      if (!Number.isFinite(count) || count < 0) continue;
      authorFlagCounts[handle] = Math.floor(count);
    }
    const countedPostIds = Array.isArray(raw?.countedPostIds) ? raw.countedPostIds.map(String).filter(Boolean).slice(-COUNTED_ID_CAP) : [];
    return {
      trustedHandles: uniqueHandles(raw?.trustedHandles),
      noisyHandles: uniqueHandles(raw?.noisyHandles),
      authorFlagCounts,
      countedPostIds,
      toneEnabled: raw?.toneEnabled === true,
      toneLabels: normalizeToneList(raw?.toneLabels),
      hiddenTones: normalizeHiddenTones(raw?.hiddenTones, normalizeToneList(raw?.toneLabels)),
      toneStatus: normalizeToneStatus(raw?.toneStatus)
    };
  }
  function settingsPatch(patch) {
    const picked = {};
    if (!patch || typeof patch !== "object") return picked;
    for (const key of STORAGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) picked[key] = patch[key];
    }
    const normalized = normalizeState({ ...DEFAULT_STATE, ...picked });
    const out = {};
    for (const key of STORAGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = normalized[key];
    }
    return out;
  }
  function recordFlag(state, handle, postId) {
    const current = normalizeState(state);
    const id = String(postId || "");
    if (id && current.countedPostIds.includes(id)) {
      return { state: current, changed: false };
    }
    const key = authorKey(handle);
    const authorFlagCounts = {
      ...current.authorFlagCounts,
      [key]: (current.authorFlagCounts[key] || 0) + 1
    };
    const countedPostIds = id ? [...current.countedPostIds, id].slice(-COUNTED_ID_CAP) : current.countedPostIds;
    return {
      state: { ...current, authorFlagCounts, countedPostIds },
      changed: true
    };
  }
  function createMemoryStorage(initial = {}) {
    let state = normalizeState({ ...DEFAULT_STATE, ...initial });
    const listeners = /* @__PURE__ */ new Set();
    return {
      async get() {
        return structuredClone(state);
      },
      async set(patch) {
        const safe = settingsPatch(patch);
        state = normalizeState({ ...state, ...safe });
        for (const listener of listeners) listener(safe);
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      }
    };
  }
  function hasChromeStorage() {
    return !!globalThis.chrome?.storage?.local;
  }
  function createChromeStorage() {
    const chromeApi = globalThis.chrome;
    return {
      async get() {
        const data = await chromeApi.storage.local.get(DEFAULT_STATE);
        return normalizeState(data);
      },
      async set(patch) {
        await chromeApi.storage.local.set(settingsPatch(patch));
      },
      subscribe(fn) {
        if (!chromeApi.storage?.onChanged) return () => {
        };
        const listener = (changes, area) => {
          if (area === "local") fn(changes);
        };
        chromeApi.storage.onChanged.addListener(listener);
        return () => chromeApi.storage.onChanged.removeListener(listener);
      }
    };
  }

  // extension/tone/filter-ui.js
  var HIDDEN_COUNT_TYPE = "fcb-hidden-count";
  function hiddenCountMessage(count) {
    const n = Number(count);
    const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    return { type: HIDDEN_COUNT_TYPE, count: safe };
  }

  // extension/tone/memory.js
  var TONE_MEMORY_CAP = 300;
  function createToneMemory(cap = TONE_MEMORY_CAP) {
    const limit = Math.max(1, cap);
    const labels = /* @__PURE__ */ new Map();
    let listHash = hashToneList();
    let allowed = new Set(normalizeToneList());
    function storageKey(id) {
      return `${listHash}:${id}`;
    }
    function touch(id, label) {
      const key = storageKey(id);
      labels.delete(key);
      labels.set(key, label);
      while (labels.size > limit) {
        const oldest = labels.keys().next().value;
        labels.delete(oldest);
      }
    }
    return {
      useList(list) {
        const normalized = normalizeToneList(list);
        const next = hashToneList(normalized);
        if (next !== listHash) {
          labels.clear();
          listHash = next;
          allowed = new Set(normalized);
        }
        return listHash;
      },
      get hash() {
        return listHash;
      },
      get(id) {
        const key = storageKey(String(id || ""));
        if (!labels.has(key)) return null;
        const label = labels.get(key);
        touch(String(id || ""), label);
        return label;
      },
      set(id, label) {
        const key = String(id || "");
        const name = normalizeToneName(label);
        if (!key || !name || name === "" || !allowed.has(name)) return false;
        if (name !== FALLBACK_TONE && !allowed.has(name)) return false;
        touch(key, name);
        return true;
      },
      clear() {
        labels.clear();
      },
      get size() {
        return labels.size;
      }
    };
  }

  // extension/tone/request.js
  async function requestToneLabel({ id, text, labels, currentLabels, send }) {
    const request = frameToneRequest(id, text, labels);
    try {
      if (!request.id || !request.text) return { label: null };
      let response;
      try {
        response = await send(request);
      } catch {
        return { label: null, error: "Tone host disconnected." };
      }
      const allow = typeof currentLabels === "function" ? currentLabels() : currentLabels;
      const parsed = parseHostMessage(response, allow === void 0 ? request.labels : allow);
      if (parsed.id !== request.id) return { label: null };
      if (!parsed.label) return { label: null, error: parsed.error };
      return { label: parsed.label, ms: parsed.ms };
    } finally {
      request.text = "";
    }
  }

  // extension/tone/watch.js
  function watchVisiblePost({
    post,
    connected,
    delayMs = 500,
    onReady,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (timer) => clearTimeout(timer)
  } = {}) {
    let timer = null;
    let stopped = false;
    function clear() {
      if (timer == null) return;
      cancel(timer);
      timer = null;
    }
    return {
      show() {
        if (stopped || timer != null) return;
        const scheduled = schedule(() => {
          if (timer !== scheduled) return;
          timer = null;
          if (stopped) return;
          if (typeof connected === "function") {
            if (!connected()) return;
          } else if (post && post.isConnected === false) return;
          onReady?.();
        }, delayMs);
        timer = scheduled;
      },
      hide() {
        clear();
      },
      stop() {
        stopped = true;
        clear();
      }
    };
  }

  // extension/tone/viewport.js
  var TONE_QUEUE_CAP = 10;
  function createVisibleQueue(cap = TONE_QUEUE_CAP) {
    const limit = Math.max(1, cap);
    const items = [];
    return {
      add(entry) {
        const id = String(entry?.id || "");
        const text = String(entry?.text || "");
        if (!id || !text) return [];
        const index = items.findIndex((item) => item.id === id);
        if (index >= 0) items.splice(index, 1);
        items.push({ id, text });
        const dropped = [];
        while (items.length > limit) {
          const oldest = items.shift();
          if (oldest) {
            oldest.text = "";
            dropped.push(oldest.id);
          }
        }
        return dropped;
      },
      drop(id) {
        const key = String(id || "");
        const index = items.findIndex((item) => item.id === key);
        if (index < 0) return false;
        const [removed] = items.splice(index, 1);
        if (removed) removed.text = "";
        return true;
      },
      takeLatest() {
        return items.pop() || null;
      },
      get size() {
        return items.length;
      },
      ids() {
        return items.map((item) => item.id);
      }
    };
  }
  function createToneController({
    memory,
    send,
    delayMs = 500,
    queueCap = TONE_QUEUE_CAP,
    observe,
    readPost,
    paint: paint2,
    schedule,
    cancel
  } = {}) {
    if (!memory || typeof send !== "function" || typeof observe !== "function" || typeof readPost !== "function") {
      throw new TypeError("createToneController needs memory, send, observe, and readPost.");
    }
    const queue = createVisibleQueue(queueCap);
    const stops = /* @__PURE__ */ new Set();
    let sending = false;
    let paused = false;
    async function pump() {
      if (sending || paused) return;
      sending = true;
      try {
        while (!paused) {
          const next = queue.takeLatest();
          if (!next) break;
          const payload = { id: next.id, text: next.text };
          next.text = "";
          let result = null;
          try {
            result = await send(payload);
          } catch {
            result = { id: payload.id, error: "Tone host disconnected." };
          } finally {
            payload.text = "";
          }
          if (result?.label && memory.set(payload.id, result.label)) {
            if (!paused) paint2?.(payload.id, result.label);
          }
          if (paused) break;
        }
      } finally {
        sending = false;
        if (!paused && queue.size) pump();
      }
    }
    function watch(post, onLeave) {
      if (paused || !post) return () => {
      };
      let element = post;
      let queuedId = "";
      let stopObserve = () => {
      };
      const dwell = watchVisiblePost({
        delayMs,
        schedule,
        cancel,
        connected: () => element != null && element.isConnected !== false,
        onReady: () => {
          const el = element;
          if (!el) return;
          const snap = readPost(el);
          if (!snap?.id || !snap.text) return;
          const known = memory.get(snap.id);
          if (known) {
            paint2?.(snap.id, known);
            return;
          }
          queue.add({ id: String(snap.id), text: snap.text });
          queuedId = String(snap.id);
          pump();
        }
      });
      function leave() {
        dwell.hide();
        if (queuedId) queue.drop(queuedId);
        queuedId = "";
        element = null;
        const detach = stopObserve;
        stopObserve = () => {
        };
        detach();
        stops.delete(stop);
        onLeave?.();
      }
      stopObserve = observe(post, (visible) => {
        if (!element) return;
        if (!visible) {
          leave();
          return;
        }
        const snap = readPost(element);
        if (snap?.id) {
          const known = memory.get(snap.id);
          if (known) {
            paint2?.(snap.id, known);
            return;
          }
        }
        dwell.show();
      }) || (() => {
      });
      const stop = () => {
        dwell.stop();
        if (queuedId) queue.drop(queuedId);
        queuedId = "";
        element = null;
        stopObserve();
        stops.delete(stop);
      };
      stops.add(stop);
      return stop;
    }
    return {
      watch,
      queue,
      pause() {
        paused = true;
        for (const stop of [...stops]) stop();
        while (queue.size) {
          const item = queue.takeLatest();
          if (item) item.text = "";
        }
      },
      resume() {
        paused = false;
      }
    };
  }

  // extension/content/content.js
  var running = /* @__PURE__ */ new WeakMap();
  var BATCH = 20;
  function readFixtureNow(doc) {
    const root = doc?.documentElement;
    if (root?.dataset?.fcbFixture !== "1") return null;
    const raw = root.getAttribute("data-fcb-fixture-now");
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return () => new Date(date.getTime());
  }
  function debounce(fn, ms) {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, ms);
    };
  }
  async function start(doc, options) {
    if (!doc.body) {
      await new Promise((resolve) => {
        doc.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
      });
    }
    const storage = options.storage || (hasChromeStorage() ? createChromeStorage() : createMemoryStorage());
    const debounceMs = options.debounceMs ?? 150;
    const nowFn = options.now || readFixtureNow(doc) || (() => /* @__PURE__ */ new Date());
    let state = normalizeState(await storage.get().catch(() => ({})));
    let toneUnregister = null;
    let pagePort = null;
    const revealedPosts = /* @__PURE__ */ new Set();
    const toneMemory = options.toneMemory || createToneMemory();
    toneMemory.useList(state.toneLabels);
    const toneController = createToneController({
      memory: toneMemory,
      delayMs: options.toneDelayMs ?? 500,
      readPost(post) {
        try {
          const snap = extractPost(post);
          if (!snap?.id || !snap.text) return null;
          if (post.dataset) post.dataset.fcbPostId = String(snap.id);
          return { id: String(snap.id), text: snap.text };
        } catch {
          return null;
        }
      },
      paint(id, label) {
        const allowed = normalizeToneLabel(label, state.toneLabels);
        if (!allowed) return;
        const post = findTonePost(id);
        if (!post || post.isConnected === false) return;
        applyAsyncResult(post, { hits: [], tone: { label: allowed } });
        applyHiddenTones();
      },
      observe(post, onVisible) {
        const IO2 = globalThis.IntersectionObserver;
        if (typeof IO2 !== "function") {
          onVisible(true);
          return () => {
          };
        }
        const observer = new IO2((entries) => {
          const visible = entries.some((entry) => entry.isIntersecting && entry.target === post);
          onVisible(visible);
        }, { root: columnScrollRoot(post), threshold: 0.01 });
        observer.observe(post);
        return () => observer.disconnect();
      },
      send(entry) {
        return requestToneLabel({
          id: entry.id,
          text: entry.text,
          labels: state.toneLabels,
          currentLabels: () => state.toneLabels,
          send: toneSender
        });
      }
    });
    function findTonePost(id) {
      const key = String(id);
      for (const post of findPosts(doc.body || doc)) {
        if (post.dataset?.fcbPostId === key) return post;
      }
      return null;
    }
    function toneSender(request) {
      if (typeof options.toneSend === "function") return options.toneSend(request);
      syncPagePort();
      const chromeApi = globalThis.chrome;
      if (!chromeApi?.runtime?.sendMessage) {
        return Promise.resolve({ id: request.id, error: "Tone host not installed" });
      }
      return chromeApi.runtime.sendMessage({
        type: TONE_MESSAGE_TYPE,
        id: request.id,
        text: request.text,
        labels: request.labels
      });
    }
    function syncPagePort() {
      if (!state.toneEnabled || typeof options.toneSend === "function") {
        pagePort?.disconnect?.();
        pagePort = null;
        return;
      }
      if (pagePort) return;
      const chromeApi = globalThis.chrome;
      if (!chromeApi?.runtime?.connect) return;
      try {
        pagePort = chromeApi.runtime.connect({ name: TONE_PAGE_PORT });
        pagePort.onDisconnect.addListener(() => {
          pagePort = null;
        });
        reportHiddenCount();
      } catch {
        pagePort = null;
      }
    }
    function toneChecker(snapshot) {
      const label = toneMemory.get(snapshot?.id);
      if (!label) return { hits: [], tone: null };
      return { hits: [], tone: { label } };
    }
    function removeToneChips() {
      for (const chip of doc.querySelectorAll(".fcb-tone")) chip.remove();
      for (const host of doc.querySelectorAll(".fcb-host")) {
        if (host.dataset) delete host.dataset.fcbTone;
      }
      for (const post of findPosts(doc.body || doc)) {
        if (post.dataset) delete post.dataset.fcbToneLive;
      }
    }
    function stopToneWatches() {
      toneController.pause();
      toneUnregister?.();
      toneUnregister = null;
      pagePort?.disconnect?.();
      pagePort = null;
      removeToneChips();
    }
    function syncToneRegistration() {
      toneUnregister?.();
      toneUnregister = null;
      if (!state.toneEnabled) return;
      toneController.resume();
      toneUnregister = registerAsyncChecker(toneChecker);
      syncPagePort();
    }
    function roughlyInView(post) {
      const rect = post.getBoundingClientRect?.();
      if (!rect) return true;
      if (!rect.height && !rect.width && !rect.top && !rect.bottom) return true;
      const root = columnScrollRoot(post);
      const box = root?.getBoundingClientRect?.();
      const top = box?.top ?? 0;
      const bottom = box?.bottom ?? (post.ownerDocument?.defaultView?.innerHeight || 800);
      return rect.bottom > top - 40 && rect.top < bottom + 40;
    }
    function armTone(post) {
      if (!state.toneEnabled || !post || post.dataset?.fcbToneLive === "1") return;
      if (!roughlyInView(post)) return;
      if (post.dataset) post.dataset.fcbToneLive = "1";
      toneController.watch(post, () => {
        if (post.dataset) delete post.dataset.fcbToneLive;
      });
    }
    function rescanTone() {
      if (!state.toneEnabled) return;
      for (const post of findPosts(doc.body || doc)) {
        if (post.dataset?.fcbScored !== "1") continue;
        armTone(post);
      }
      applyHiddenTones();
    }
    function collapsePost(post, visibleOnly = true) {
      const id = post?.dataset?.fcbPostId;
      if (!id) return;
      if (visibleOnly && !roughlyInView(post)) return;
      syncPostCollapse(post, {
        label: toneMemory.get(id),
        hiddenTones: state.hiddenTones,
        labels: state.toneLabels,
        revealed: revealedPosts,
        postId: id,
        onShow(postId) {
          revealedPosts.add(String(postId));
          applyHiddenTones();
        }
      });
    }
    function applyHiddenTones(options2 = {}) {
      const visibleOnly = options2.visibleOnly !== false;
      for (const post of findPosts(doc.body || doc)) collapsePost(post, visibleOnly);
      reportHiddenCount();
    }
    function reportHiddenCount() {
      if (!pagePort?.postMessage) return;
      try {
        pagePort.postMessage(hiddenCountMessage(doc.querySelectorAll(".fcb-hidden-bar").length));
      } catch {
        pagePort = null;
      }
    }
    function refreshTone() {
      if (!state.toneEnabled) {
        stopToneWatches();
        return;
      }
      syncToneRegistration();
      rescanTone();
    }
    syncToneRegistration();
    const unsubscribe = storage.subscribe?.(() => {
      storage.get().then((next) => {
        const was = state.toneEnabled;
        const prevHidden = (state.hiddenTones || []).join(",");
        const prevLabels = (state.toneLabels || []).join("\n");
        state = normalizeState(next);
        const labelsChanged = state.toneLabels.join("\n") !== prevLabels;
        if (labelsChanged) {
          toneMemory.useList(state.toneLabels);
          toneController.pause();
          toneController.resume();
          removeToneChips();
          if (state.toneEnabled) rescanTone();
        }
        if (state.toneEnabled !== was) refreshTone();
        if (labelsChanged || (state.hiddenTones || []).join(",") !== prevHidden) {
          applyHiddenTones({ visibleOnly: false });
        }
      }).catch(() => {
      });
    });
    let scoreChain = Promise.resolve();
    const enqueueScore = (post) => {
      const job = scoreChain.then(() => scoreAndBadge(post));
      scoreChain = job.catch(() => {
      });
      return job;
    };
    async function scoreAndBadge(post) {
      if (!post || post.isConnected === false) return;
      if ([...post.children].some((child) => child.classList?.contains("fcb-host"))) return;
      let snapshot;
      try {
        snapshot = extractPost(post);
      } catch {
        return;
      }
      const context = {
        now: nowFn(),
        trustedHandles: state.trustedHandles,
        noisyHandles: state.noisyHandles,
        authorFlagCounts: state.authorFlagCounts
      };
      const result = scorePost(snapshot, context);
      if (result.hits.length > 0) {
        const next = recordFlag(state, snapshot.authorHandle, snapshot.id);
        if (next.changed) {
          state = next.state;
          try {
            await storage.set({
              authorFlagCounts: state.authorFlagCounts,
              countedPostIds: state.countedPostIds
            });
          } catch {
            result.author.flagCount = null;
          }
        }
        result.author.flagCount = state.authorFlagCounts[authorKey(snapshot.authorHandle)] ?? result.author.flagCount;
      } else {
        result.author.flagCount = state.authorFlagCounts[authorKey(snapshot.authorHandle)] || 0;
      }
      if (result.badge) {
        try {
          mountBadge(post, result);
        } catch {
        }
      }
      if (post.dataset) {
        post.dataset.fcbPostId = String(snapshot.id);
        post.dataset.fcbScored = "1";
      }
      collapsePost(post, false);
      armTone(post);
    }
    const queue = [];
    let flushing = false;
    const seen = (post) => post.dataset?.fcbSeen === "1" || post.getAttribute?.("data-fcb-seen") === "1";
    const mark = (post) => {
      post.dataset.fcbSeen = "1";
    };
    function enqueue(root) {
      for (const post of findPosts(root)) {
        if (seen(post)) continue;
        mark(post);
        queue.push(post);
      }
    }
    const IO = globalThis.IntersectionObserver;
    const observers = /* @__PURE__ */ new Set();
    const columnObservers = /* @__PURE__ */ new Map();
    let viewportObserver = null;
    function makeObserver(root) {
      let observer;
      observer = new IO((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          enqueueScore(entry.target);
        }
      }, { root, rootMargin: "120px 0px", threshold: 0.01 });
      observers.add(observer);
      return observer;
    }
    function observerFor(post) {
      if (typeof IO !== "function") return null;
      const scroller = columnScrollRoot(post);
      if (!scroller) {
        if (!viewportObserver) viewportObserver = makeObserver(null);
        return viewportObserver;
      }
      let columnObserver = columnObservers.get(scroller);
      if (!columnObserver) {
        columnObserver = makeObserver(scroller);
        columnObservers.set(scroller, columnObserver);
      }
      return columnObserver;
    }
    async function flush() {
      if (flushing) {
        await scoreChain;
        return;
      }
      flushing = true;
      try {
        let budget = options.immediate ? queue.length || 1 : BATCH;
        while (queue.length && budget > 0) {
          const post = queue.shift();
          budget -= 1;
          if (!post || post.isConnected === false) continue;
          const observer = observerFor(post);
          if (observer) observer.observe(post);
          else enqueueScore(post);
        }
        await scoreChain;
        applyHiddenTones();
      } finally {
        flushing = false;
        if (queue.length) schedule();
      }
    }
    const schedule = debounce(() => {
      flush().catch(() => {
      });
    }, debounceMs);
    const scheduleRepair = debounce(() => {
      applyHiddenTones();
    }, debounceMs);
    const MO = globalThis.MutationObserver;
    const mo = typeof MO === "function" ? new MO((records) => {
      let repair = false;
      for (const record of records) {
        if (record.type === "attributes") {
          repair = true;
          continue;
        }
        for (const node of record.addedNodes || []) {
          if (node.nodeType === 1) enqueue(node);
        }
        if (record.removedNodes?.length) repair = true;
      }
      if (queue.length) schedule();
      if (repair) scheduleRepair();
    }) : null;
    mo?.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-fcb-collapsed"]
    });
    const rescanSoon = debounce(() => {
      rescanTone();
    }, debounceMs);
    doc.addEventListener("scroll", () => {
      hideOpenTips(doc);
      rescanSoon();
    }, true);
    enqueue(doc.body || doc);
    if (options.immediate) await flush();
    else schedule();
    return {
      disconnect() {
        mo?.disconnect();
        for (const observer of observers) observer.disconnect();
        stopToneWatches();
        unsubscribe?.();
      },
      async scanNow() {
        enqueue(doc.body || doc);
        await flush();
      }
    };
  }
  function startFramingBadges(doc, options = {}) {
    if (!doc) throw new Error("startFramingBadges needs a document.");
    if (running.has(doc)) return running.get(doc);
    const job = start(doc, options);
    running.set(doc, job);
    return job;
  }
  var extensionApi = globalThis.chrome;
  var isExtensionContentScript = !!extensionApi?.runtime?.id && typeof document !== "undefined";
  if (isExtensionContentScript) {
    document.documentElement.dataset.fcbLive = "1";
    if (document.documentElement.dataset.fcbFixture === "1" && extensionApi.runtime?.id) {
      document.documentElement.dataset.fcbExtensionId = extensionApi.runtime.id;
    }
    startFramingBadges(document).catch(() => {
    });
  }
})();

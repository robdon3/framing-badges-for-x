# Framing Badges for X

A Manifest V3 extension you load unpacked. It puts one small badge on each post as the post scrolls into view. The badge is about **how the post is framed**.

**It scores framing, not truth.** It does not open sources, and it never decides that a post is true. If none of the rules below match, the post gets no framing badge. That is not a verification.

Framing badges are rules only. There is no network request and no telemetry. v1.3 can add an optional tone chip from Apple's on-device model. That chip is off until you turn it on, and it does not change the framing badge.

**Privacy.** This extension makes no network calls. Framing rules run on the page. Tone, if you turn it on, is an on-device model only. Post text is not sent to a server and is not written to disk. Details are in [Privacy](#privacy).

## Load it unpacked

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `extension/` folder in this repo.
4. Visit `https://x.com` or `https://pro.x.com`. Badges show up as posts enter the screen. On X Pro, each column scrolls on its own, and a column added later is picked up too. The extension does not run on `twitter.com`.
5. Open the toolbar button, then **Edit trusted and noisy handles**, or open the extension’s details page and choose **Extension options**.

Do not publish this to the Chrome Web Store. It is for local testing.

The same folder is zipped at `dist/x-framing-badges.zip` (files at the archive root, `manifest.json` first). Rebuild it with `npm run build`, unzip somewhere else, and load that folder the same way. You can also keep using `extension/` directly.

## Tone check on a Mac (optional)

The tone chip sits beside a framing badge, or on its own when no framing rule fired. You choose the tone names. The first list is whining, fun, sad, angry, hype, sarcastic, informative, and neutral. Neutral is an ordinary tone: you can remove it or hide it. The model is Apple's on-device Foundation Model, reached through Chrome native messaging. Post text is not written to disk and is not sent to a server. The framing badge is still the rules engine above.

This needs a Mac where Apple Intelligence is already available (checked on macOS 27 with the command-line tools, not the Xcode app). The helper does not build on Linux.

The unpacked extension id is stable because `extension/manifest.json` has a `key`. This build's id is `eadkmedlbenoalongikmdhedfinggpoh`.

From this repo, on the Mac:

```bash
bash native-host/install.sh
```

To compile the helper by hand instead, from `native-host/`:

```bash
xcrun --sdk macosx swiftc -parse-as-library -O -o tone-host ToneHost.swift
```

`-parse-as-library` is required because the file uses `@main`. Command-line tools do not ship the `@Generable` macro plugin, so the helper constrains the label with `DynamicGenerationSchema` instead. `install.sh` runs that same `swiftc` command, copies the binary to `~/Library/Application Support/XFramingBadges/tone-host`, and writes `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.xframingbadges.tone.json`. The host name is `com.xframingbadges.tone`. `allowed_origins` is `chrome-extension://eadkmedlbenoalongikmdhedfinggpoh/`. The script prints that id.

Then:

1. Open `chrome://extensions` and click **Reload** on Framing Badges for X. If the popup still says the host is missing, quit Chrome and open it again.
2. Open the toolbar popup or the options page.
3. Turn on **Tone check (on-device Apple model)**. It is off by default.
4. Scroll `https://x.com` or `https://pro.x.com`. A post that stays in the viewport for about half a second gets a tone chip. If a framing rule also fired, the chip sits beside that badge. On X Pro, each column is watched on its own. A label from this page load can show again without asking the model. Reload the page and the labels are gone.
5. In the popup, under **Tones**, type a name and press Add (Enter works too). A name can be letters, digits, spaces, hyphens, and apostrophes, up to 24 characters. Keep at least one tone and at most 12. Check Hide to collapse those posts to a thin bar, `Hidden: <tone>`, with a **Show** button that reveals that one post until you refresh. Unchecking a tone brings those posts back immediately. **Reset to defaults** restores the original eight, including neutral. The popup says `Hidden this page: N`. Adding, removing, or replacing a tone updates the page immediately: old labels are forgotten, chips and bars from the old list come off, and posts on screen are scored again with the new list. A reply from the previous list is ignored. If the model does not return one of the current names, the post stays unlabeled: no chip and no hide.

If the helper is missing or the model is unavailable, no tone chip is shown. The popup status line says `Tone host not installed`, or the reason the on-device model is unavailable.

Remove the helper with:

```bash
bash native-host/uninstall.sh
```

## Check the rules without an account

Open `test/fixtures.html` in Chrome. It is fake X markup, not a live timeline, and it does not sign you in. The page clock is frozen at `2026-11-07T12:00:00.000Z` so the 48 hour examples stay valid. Each post has a caption that says what the badge should be.

`npm test` loads that file in Node and checks every badge. `npm run screenshot` loads the real extension in headless Chrome against the same markup served as `https://x.com/fcb-fixture` (the request never leaves the machine).

## What the badge means

A label is shown only when a rule fires. Hover or focus it for every rule that fired and why. The tooltip repeats that this scores framing, not truth. A post that matches nothing has no framing badge.

| Badge | Meaning |
| --- | --- |
| Claim | The wording attributes a statement (`officials claim`, `sources say`, `reportedly`, `Mayor Adams says`). That is not a checked fact. |
| Unstamped | A number or odds figure (a percent, a `$` price, odds, or a prediction-market price) with no as-of time beside it. A market price is not an opinion. The post’s own publish time does not date the figure. |
| Alarm | `BREAKING`, `JUST IN`, mostly-caps text, or a siren/alarm emoji, and the post has no source link and no named source. |
| Recycled | A visible linked-article or link-card date is more than 48 hours older than the post, and the post still frames it as news. |
| Bait | An engagement phrase (`RT if`, `nobody is talking about`, `they don't want you to know`, and the list in `extension/rules/bait.js`), or a high score from the local outrage lexicon. Sentiment is not evidence. |

### Precedence

**Claim, then Unstamped, then Alarm, then Recycled, then Bait.**

Claim wins when several fire, because “someone said this” is the more precise label. An unstamped number is next: it is a price or odds figure with no as-of time, not an opinion. No rule in v1 detects opinion framing, so there is no Opinion badge. Urgency with no source comes before “this link is old,” and rhetorical bait is last. The tooltip still lists every hit. A handle on your trusted list does not change the badge.

## Rules

Each rule is its own module under `extension/rules/`. They follow `docs/fact-check-standards.md`.

1. **Urgency** (`urgency.js`) sets Alarm only when a urgency signal is present **and** there is no source link **and** no named source. Named sources are `@mentions`, a short outlet list, and `according to Name`. “Officials” and “sources” are anonymous, so they do not clear Alarm. `just in time` / `just in case` do not count. Mostly-caps means at least four words of 4+ letters, and at least 60% of those words are uppercase. The author’s own handle is not a source.
2. **Attribution** (`attribution.js`) sets Claim for `reportedly`, `allegedly`, `sources say`, `officials claim`, `people familiar with`, and a capitalized `Name says` / `Name claims`. Pronouns (`She says`) do not match.
3. **Freshness** (`freshness.js`) sets Recycled when a **visible** card or linked-article date is over 48 hours before the post time (exactly 48 does not fire) and the text uses news framing (`breaking`, `just in`, `developing`, `latest`, `urgent`, and the rest of the list in that file). Compared with the post’s `<time>` when that exists. If no date is visible, it does not guess. Slash dates like `01/11/2020` are ignored because the locale would be a guess. Month names and ISO dates are read.
4. **Bait** (`bait.js` + `lexicon.js`) sets Bait from the phrase list or from VADER-style scoring (negation, boosters, ALL CAPS, `but`, punctuation, then `sum / sqrt(sum² + 15)`). The lexicon is an original list in the repo, not a download. Outrage fires at 3 strong words (valence ≤ -2), or 2 strong words when the compound score is ≤ -0.7. One mild word (`bad`) does not fire.
5. **Numbers** (`numbers.js`) sets Unstamped for `%`, `$` prices, American odds (`+150`), fractional odds when the word “odds” is present, and prediction-market names (Polymarket, Kalshi, and the rest of that list) next to a number, when no as-of time sits beside the figure. A clock time or calendar date in the same sentence, or within 48 characters, counts as that timestamp. The status clock does not. The badge is Unstamped, not Opinion.
6. **Source lists** (`sources.js`, options page, `storage/state.js`). You edit trusted and noisy handles, one per line. The tooltip says which list the author is on. A flag is counted once per post id, per browser profile, in `chrome.storage.local`, and the tooltip shows that count. Editing a list does not rescore posts already on screen; scroll a fresh copy or reload.

Standards mapping, in short: this build never assigns “verified.” Claim is the attributed-claim label. Unstamped is the number that has no as-of time; a prediction-market price is not labeled an opinion. Alarm, Recycled, and Bait are the exclude-untraceable, recycled, and “sentiment is not evidence” cases. Reposts and snippet-only posts are not treated as confirmation, because nothing here opens a source.

## Privacy

- The extension only reads the DOM of posts it badges.
- It does not click, like, repost, reply, post, or type.
- It makes no network requests. No remote scripts, fonts, or images. No telemetry.
- Permissions are `storage`, `nativeMessaging`, and host access to `https://x.com/*`, `https://www.x.com/*`, and `https://pro.x.com/*`. Nothing else. `nativeMessaging` talks only to the local tone helper, and only while Tone check is on.
- Post text is not saved. It is not written to `chrome.storage` (local, sync, or session), `localStorage`, IndexedDB, or cookies. The badge, tooltip, and hidden bar use fixed wording, not the post. The extension does not log the post.
- The tone helper reads post text from Chrome's native-messaging pipe, classifies it, and drops it. It does not write that text to disk, stderr, or a file. A reply is `{id, label, ms}` or `{id, error}` with a fixed error string.
- While a request is in flight, the text sits only in that request. After the send, that copy is cleared. The in-memory label map is post id plus the current tone list, and the value is one tone name from that list. It does not hold text, and a refresh drops it. The saved settings are the tone list and the hide list, not post text.
- Extension pages use a CSP of `default-src 'none'` with local scripts and styles only.
- Handles, lists, flag counts, the tone on/off switch, the hide list, and a fixed status line stay in `chrome.storage.local` on this profile. Tone labels do not.
- Badge CSS is limited to `.fcb-` classes so it does not restyle the site. The badge is `position: absolute`, so it does not push the post text. If a post’s computed position is `static`, the article gets `position: relative` so the badge has a box to sit in.

## Security

A post is untrusted text. The tone check treats it as data, not as instructions.

- The helper's instructions stay fixed and separate from the post. The post is wrapped between `[[POST]]` and `[[/POST]]`, after control characters, zero-width characters, bidi overrides, and those delimiter marks are stripped. The text is capped at about 1000 characters.
- Each request sends `{id, text, labels}`. `labels` is the tone list at the moment of the send, one to twelve names, with no extra fallback added. The host checks those names again and uses them as the only allowed answers. The reply is `{id, label, ms}` or `{id, error}`. `label` is one of that request's names, or `null` when the model misses. The extension ignores a reply if the list changed while it was in flight, and a null or unknown label draws no chip and is not hidden.
- Each request starts a new Foundation Models session, so one post's text is not left in the next post's transcript.
- Frames larger than 64KB are rejected without being read. Malformed JSON gets a generic error and is not sent to the model.
- The native host manifest allows only this extension's id, `chrome-extension://eadkmedlbenoalongikmdhedfinggpoh/`.

## Tone chip and the async slot

There is still no “check this post” button and no network permission. The optional tone check uses the existing slot, and it does not recompute the framing badge:

- `registerAsyncChecker()` in `extension/content/async-check.js` receives the tone checker only while the toggle is on. The checker returns `{ hits: [], tone }`. It does not add a framing hit.
- `collectAsyncResult()` / `scorePostWithAsync()` in `extension/content/scorer.js`
- `applyAsyncResult()` in `extension/content/badge.js` paints a separate `.fcb-tone` chip. Framing precedence is unchanged, and the framing tooltip stays on the rules result.

The content script asks only for a post that is in the viewport (each X Pro column has its own scroll root) and has stayed there for about 500ms. If it scrolls away before that request is sent, it is dropped. The waiting list is at most 10 posts, newest visible first. One request runs at a time. Labels are an in-memory map of post id and tone-list hash to one name from that list, capped at 300, and they disappear on refresh or when the list changes. Post text is cleared after the send. It is not written to disk.

The service worker opens `connectNative` to `com.xframingbadges.tone` on the first request and closes it after about 60 seconds with nothing to do, when Tone check is turned off, or when no x.com tab is open. Each request starts a new Foundation Models session so the transcript does not grow. Closing the port lets the helper process and its model memory exit.

## Project layout

```
extension/                 unpacked extension (load this folder)
  manifest.json
  background/service-worker.js
  content/                 observers, extract, badge, scorer
  tone/                    viewport queue, in-memory labels, native host lifetime
  rules/                   one module per rule, plus the local lexicon
  storage/state.js         chrome.storage.local
  options/                 trusted and noisy lists, tone toggle
  popup/
  icons/
native-host/               macOS tone helper (Swift) and install.sh
test/fixtures.html         fake timeline
test/pro-fixtures.html     fake X Pro deck, three scrolling columns
test/cases.js              the cases the fixture is rendered from
test/unit/                 node:test, one file per rule
test/dom/badges.test.js    content script against the fixture
dist/x-framing-badges.zip  built archive
scripts/                   icons, fixture, zip, screenshot
docs/fact-check-standards.md
```

X selectors live only in `extension/content/selectors.js` (`article[data-testid="tweet"]`, tweet text, User-Name, status `time`, card wrappers, with fallbacks).

## Develop

```bash
npm install
npm test
npm run build
npm run screenshot
```

`npm test` regenerates the fixture, the file-open bundle, and `extension/content/content-bundle.js`, then runs the unit tests and the DOM test. No network. Chrome loads that bundle rather than the ES modules: current Chrome runs an unpacked module content script as a classic script, which rejects `import`. The modules under `extension/` stay the source for tests and for the bundle.

## Known limits

- It can be wrong. A fair post can wear a badge, and a false post can have no badge at all.
- Ordinary percents and prices (`revenue grew 12%`, a `$4` coffee) are flagged when they have no as-of time. That is deliberate and noisy.
- A clock or date near an unrelated number can suppress the number flag. A date far from the number does not stamp it.
- `latest`, `urgent`, and `tonight` can mark an old link as recycled even when the tone is casual.
- Mostly-caps and `Name says` misfire on announcements, acronyms, and quoted speech.
- The outrage list misses sarcasm and plenty of insults, and a heated but accurate post can still score as Bait.
- English phrases only. Images are not read, except emoji `alt` text already in the DOM.
- If X renames `data-testid` values and the fallbacks miss, the post is skipped or scored from empty text (no framing badge), not from the whole article. Action counts are not scored on purpose.
- The badge can cover the caret or the timestamp. Ancestors with `overflow: hidden` can clip a tooltip; the tooltip is `position: fixed` to reduce that.
- Setting `position: relative` on a static article can change the containing block for absolute descendants X draws inside the article.
- Flag counts are per browser profile, not per X account. They are the count at the time the post was scored, and the remembered id list is capped at 2000.
- List edits apply to posts scored after the change.
- `www.x.com` and `pro.x.com` are included. `twitter.com` is not.
- X Pro posts are read with the same `article[data-testid="tweet"]` hooks as x.com. That matches public selector lists through March 2026. This build was not checked in a logged-in X Pro session, so a renamed test id there would miss until `selectors.js` is updated.
- In a narrow column the badge sits closer to the corner. The tooltip is moved to the page when you hover, with `position: fixed`, so a column’s own scroll box does not clip it.
- The fixture’s `data-fcb-fixture` / `data-fcb-fixture-now` attributes freeze the clock for this test page only.
- The tone chip can be wrong. It is an on-device label, not a framing score and not a fact check. It stays hidden when the helper is missing, Apple Intelligence is off, or the model errors.
- Tone labels are English-oriented. A post that leaves the screen in under half a second is not sent. Labels from this page load are capped at 300 and are not kept after a refresh. The on-device helper exits about a minute after the last request.

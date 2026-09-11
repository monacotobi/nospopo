# nospopo — design

Date: 2026-08-31
Status: approved for planning

## 1. Purpose

Spotify's web player mixes podcasts and audiobooks into the home page and the
left sidebar. New episodes pull the user away from music. This extension removes
spoken audio from those two surfaces, so the user keeps Spotify for listening
only.

The extension does not block spoken audio. Search still finds podcasts, and a
direct link still plays them. The extension removes the *invitation*, not the
content.

## 2. Scope

In scope:

- The home page (`https://open.spotify.com/`): podcast, episode, show, audiobook
  and chapter cards.
- The home page filter chips for podcasts and audiobooks.
- A shelf on the home page that holds no visible card after the filter runs.
- The left sidebar: library rows for shows and audiobooks, and the sidebar
  filter chips.
- A popup that shows the state and turns the filter off or on.

Out of scope:

- The search page, the browse page and all other pages.
- Any change to playback.
- Any account data, any network call, any Spotify Web API use.
- Publication in the Chrome Web Store.

## 3. Approach

The extension hides cards with a static stylesheet, and uses a small script only
for the work that CSS cannot do.

Two other approaches were rejected:

- **Rewrite the GraphQL response.** It gives a cleaner result, but it needs much
  more code, it can break the player, and a schema change fails silently.
- **Rebuild the home page from the Web API.** It needs OAuth and token refresh,
  and it loses the Spotify layout.

## 4. Detection rule

Verified against the live page on 2026-08-31. See appendix A for the raw
findings.

The home page and the sidebar use **two different** signals. This was the main
surprise of the check.

### 4.1 Home page: the link path

Every card on the home page holds a link with a type in the path:

| Type | Path prefix | Class |
|---|---|---|
| Track, album, artist, playlist | `/track/` `/album/` `/artist/` `/playlist/` | music |
| Show, episode | `/show/` `/episode/` | spoken |
| Audiobook, chapter | `/audiobook/` `/chapter/` | spoken |
| Saved episodes | `/collection/your-episodes` | spoken |

Note: on the test account the "Audiobooks for you" shelf used `/show/` links.
The `/audiobook/` and `/chapter/` prefixes stay in the list as a safety net.

Three container attributes are stable, and all three carry the same 24 matches:

```css
[data-carousel-gridlist-item="true"]:has(a[href^="/show/"])
[data-carousel-item="true"]:has(a[href^="/show/"])
[data-encore-id="card"]:has(a[href^="/show/"])
```

The extension hides all three. The outer one keeps the grid free of a gap.

### 4.2 Sidebar: the Spotify URI

The sidebar rows hold **no link**. They use `role="button"`. The href rule
therefore cannot work there. The row does carry the URI, in the `aria-labelledby`
and `id` attributes:

```
listrow-title-spotify:show:4rOoJ6Egrf8K2IrywzwOMk
listrow-title-spotify:collection:your-episodes
```

The rule is therefore:

```css
[role="row"]:has([aria-labelledby^="listrow-title-spotify:show:"])
```

with the same list for `spotify:episode:`, `spotify:audiobook:`,
`spotify:chapter:` and `spotify:collection:your-episodes`.

This signal is better than the row subtitle text ("Podcast • …"), because the URI
does not change with the interface language.

### 4.3 The filter chips

The home filter chips sit in `[aria-label="Home Filters"]`:

```css
[data-carousel-item="true"]:has(> [data-encore-id="chip"][aria-label="Podcasts"])
```

The `aria-label` is the localised name. This is the one rule that depends on the
language. The extension keeps a small label list (`Podcasts`, `Audiobooks`,
`Podcasts & Shows`) and it reads `document.documentElement.lang`. A miss here
leaves a chip visible; it breaks nothing.

### 4.4 The shortcut tiles

The tile grid at the top of the home page (the "Good afternoon" section) uses
plain `div` elements with no stable attribute. The section label changes with
the time of day, so CSS cannot reach these tiles.

The script handles them with one generic rule: from a spoken link, climb to the
highest ancestor in which **every** link points at the same target. That gives
the tile, and nothing more. The check confirmed this rule on the tile grid and
on the shelf headers.

## 5. Components

```
manifest.json
src/shared/rules.js      pure logic, no DOM
src/content/filter.css   the static hide rules
src/content/filter.js    observer, empty-shelf cleanup, state
src/popup/popup.html
src/popup/popup.css
src/popup/popup.js
src/background.js        badge, default state
icons/16.png 48.png 128.png
README.md                install steps and manual test list
```

### 5.1 `src/shared/rules.js`

Pure functions, no DOM and no Chrome API. This file holds the logic that the
unit tests cover.

- `isSpokenAudioHref(href)` returns `true` for a spoken path prefix.
- `isSpokenAudioUri(uri)` returns `true` for a spoken `spotify:` URI.
- `itemContainer(link, closest)` returns the highest ancestor in which every
  link shares one target. It takes the DOM reads as arguments, so the test can
  drive it with plain objects.
- `isShelfEmpty(cardStates)` returns `true` when every card in a shelf is
  hidden.

The file assigns its exports to `globalThis.nospopoRules`, because a Manifest V3
content script cannot use an ES module import. The unit test loads the file with
`node --test` and reads the same global.

### 5.2 `src/content/filter.css`

Static rules only. Chrome injects the file at `document_start` through
`content_scripts`, so a card never appears on screen.

Every rule starts with `html:not([data-nospopo="off"])`. The filter therefore
works before any script runs, and it fails safe: a slow or failed storage read
leaves the page filtered.

### 5.3 `src/content/filter.js`

Three jobs:

1. Read the state from `chrome.storage.local`. Set `data-nospopo="off"` on the
   `html` element when the state is off. Remove the attribute when the state is
   on.
2. Hide a shelf when all its cards are hidden. Use `isShelfEmpty()`.
3. Watch the DOM with a `MutationObserver`. Throttle the work with
   `requestAnimationFrame`, so a fast render does not cause many passes.

The script listens to `chrome.storage.onChanged`. A state change reaches an open
tab at once. The user does not reload the page.

The script never removes a node. It sets `display: none` through a class. The
stylesheet gates that class behind `html:not([data-nospopo="off"])` too, so the
state switch controls the script rules and the static rules in the same way.
Spotify's React code keeps its own view of the DOM.

A content script cannot call `chrome.action` itself. The script therefore sends
a message to the service worker, and the service worker sets the badge.

### 5.4 `src/popup/*`

Two states.

**Filter on.** The popup shows a slider track with a handle at the left. The
user must drag the handle to the right end and hold it there for 1.5 seconds.
The filter then turns off. A short drag, an early pointer release, or a click
does nothing. The control reacts to pointer events only, so a keyboard press
cannot trigger it by mistake.

**Filter off.** The popup shows one button, "Turn the filter on". One click is
enough.

### 5.5 `src/background.js`

- Set the default state to on at install time.
- Set the badge: no badge when on, a red `OFF` when off, a grey `?` after a
  selector failure.
- Start a 30-minute alarm when the state goes off. The alarm sets the state back
  to on. A new "off" action resets the alarm.

## 6. Data and permissions

- `host_permissions`: `https://open.spotify.com/*`
- `permissions`: `storage`, `alarms`

The extension stores one value: `enabled` (boolean). It makes no network call
and it reads no account data.

## 7. Failure behaviour

The extension must never break the player.

- The content script checks after 5 seconds whether the card selectors matched
  anything on the home page. If they matched nothing, the script stops, writes
  one console warning, and asks the service worker for the `?` badge. The user
  then knows that Spotify changed the page.
- All DOM work runs inside `try`/`catch`. An error stops the observer only.
- The extension hides, it does not delete.

## 8. Tests

**Unit tests** with `node --test`, no dependency, on `src/shared/rules.js`:

- `isSpokenAudioHref()` returns `true` for each spoken prefix.
- It returns `false` for each music prefix.
- It returns `false` for `null`, an empty string, an external URL and a path
  that only contains a spoken word in a name.
- `isShelfEmpty()` returns `true` for an all-hidden list, `false` for a mixed
  list, and `false` for an empty list.

Test-first order: the tests for `rules.js` come before the code.

**Manual checklist** in `README.md`:

1. The home page shows no podcast, episode, show or audiobook card.
2. The home page shows no empty shelf and no podcast filter chip.
3. The sidebar shows no show and no audiobook row.
4. Music playback still works.
5. Search still finds a podcast, and it still plays.
6. The drag control turns the filter off, and the podcasts come back without a
   reload.
7. The button turns the filter on again.
8. The filter turns itself on again after 30 minutes.
9. A page reload keeps the state.

## 9. Implementation order

1. ~~Read the live DOM of `open.spotify.com` in Chrome.~~ Done on 2026-08-31.
   See section 4 and appendix A.
2. Write the unit tests for `rules.js`, then the file.
3. Write `manifest.json` and `filter.css`. Load the extension and check the home
   page.
4. Write `filter.js`: state, empty shelves, observer.
5. Write `background.js`: badge, default, alarm.
6. Write the popup with the drag control.
7. Run the manual checklist. Write `README.md`.

## Appendix A — findings from the live check, 2026-08-31

Account: English interface, `document.documentElement.lang === "en"`.
Chrome supports `:has()` (`CSS.supports('selector(:has(a))')` is `true`).

Counts on one home page load: 532 links, 223 music links, 34 spoken links,
106 cards, 18 sections.

Confirmed:

- The card wrapper is `[data-encore-id="card"]`, not `[data-testid="card"]`.
  The grid wrappers are `[data-carousel-gridlist-item="true"]` and
  `[data-carousel-item="true"]`.
- The sidebar list is `div[role="grid"][aria-label="Your Library"]`. Its rows
  are `div[role="row"] > div[role="gridcell"] > div[data-encore-id="listRow"]`.
  These rows hold no `<a href>`.
- The sidebar carries the URI in `aria-labelledby="listrow-title-spotify:<type>:<id>"`.
- The shelf container is `[data-testid="home-page"] section`.
- React re-renders the sidebar and drops any attribute that the script sets.
  The `MutationObserver` is therefore not optional.

Result of the full rule set on the live page:

- The `Audiobooks for you` shelf: hidden, height 0, no gap.
- The `Your shows` shelf: hidden.
- The `Recents` shelf: 20 cards, 14 stay visible. The shelf stays.
- The `Jump back in` shelf: 9 cards, 5 stay visible. The shelf stays.
- The `Podcasts` and `Audiobooks` chips: gone.
- The podcast shortcut tile: gone, and the tile grid reflowed with no hole.
- The sidebar `Your Episodes` row and the podcast row: gone.
- Playback continued without interruption.

The probe removed every trace of itself from the page afterwards.

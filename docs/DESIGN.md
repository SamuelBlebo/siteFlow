# SiteFlow design system

One product on two screens. The web app is for the office; the phone app is for the site. Both use the same tokens, words and states.

## Tokens

`packages/shared/src/design.ts` is the single source:

- **Colours** (light and dark): `COLORS`, `COLORS_DARK`.
- **Sizes:** `SPACE`, `RADIUS`, `TOUCH_MIN` (48).
- **Status tones:** `TONES` (ok, warn, bad, neutral).

The two apps use them as follows:

- **Mobile:** imports them through `apps/mobile/src/theme.js`.
- **Web:** uses CSS custom properties in `apps/web/src/styles.css`. `packages/shared/test/design.test.ts` fails if they drift apart.

The look (since 2026-10-20, `docs/superpowers/specs/2026-10-20-light-look-and-skins-design.md`): light and calm. White cards on a soft warm-grey ground, rounded corners (`--radius`, 16px), hairline borders, a white sidebar that stays put, and a slim top bar with the time, the date and you.

Colour is minimal:

- **Greys:** everything normal, including "sent", "on track" and "resolved" labels.
- **The accent (the person's skin):** the main call to action (`.btn.gold`), "you are here" (current menu item, current tab), money in charts, and a project card that needs you. Its token is still called `brass` (`--brass`, `--brass-ink`, `--brass-soft`).
- **Hazard tape (yellow and black):** the logo mark only.
- **Red:** only for problems (missing, overdue, over budget, critical, not assigned). Amber `warn` for "needs attention soon".

Skins: each person picks **Brass** (default), **Amber** or **Navy** from the menu at the top right, on Your account, or on the phone's Account screen. `SKINS` in `design.ts` holds each skin's light and dark accent; the web sets `data-skin` on `<html>` (`lib/skin.js`) and the phone swaps `colors.brass*` (`theme.js`, `applySkin`). The choice is saved on `users/{uid}.skin`. Anything drawn with the accent on the phone is styled inline, so it picks up a change.

Type: Goldman for the wordmark only, Inter for everything else, headings included (tabular figures).

## Building blocks

| Need | Web | Mobile |
| --- | --- | --- |
| Loading | `<Loading what="sites" />` (spinner, `role="status"`) | `<Loading what="sites" />` |
| Nothing to show | `<Empty title action>` | `<Empty action>` |
| Could not load | `<ErrorState error what onRetry>` | `<ErrorView error what>` |
| Saved / failed | `toast()` from `lib/save.js` | Sync banner and Sync screen |
| Status label | `.pill.ok/.warn/.bad` | `<Pill kind>` |
| Sections | `<Tabs tabs value onChange>{panel}</Tabs>` | bottom tabs |
| Photos | file input + `PhotoViewer` | `<PhotoPicker>` |
| Full-screen photo | `<Lightbox items index onIndex onClose>` (arrows, swipe, caption, link) | – |
| Photo gallery | `<PhotoGallery reports>` (weeks with stage and progress, then and now) | – |
| 3D model | `<ModelCard>` on the overview; viewer in `lib/model3d.js` (three.js, web-ifc), loaded only when opened, light background in both themes | – |
| Page title bar | `<PageHead title sub>{actions}</PageHead>` | stack header (navy) |
| Brand | `<Brand big />`, `<Mark />` (hazard-tape square) | tape mark on the login screen |
| Headline numbers | `<dl className="tiles">` of `.tile` (dt, dd, `.foot` with `.delta.up/.dn/.nt` and `<Spark>`) | – |
| Dashboard sections | `.dgrid` with `.panel.c4`…`.c12` (`.panel-h` for title, line and count) | `<Card>` |
| Progress | `<Ring pct>` | – |
| Charts | `<SpendChart>`, `<CostDonut>` in `components/Charts.jsx` | – |
| On/off | `<label className="switch"><input type="checkbox" /><span /></label>` | – |

App shell: `Layout.jsx` (white sidebar that stays put: company, menu in groups with line icons from `Icons.jsx`, projects with a red dot when today's report is missing, and you) and `TopBar.jsx` (time, date, your menu with skin, light/dark and sign out). Below 860px the sidebar folds into a top bar with a sideways-scrolling menu.

Web layout helpers: `.actions`, `.section-head`, `.toolbar`, `.mt`, `.mt-sm`, `.mb`, `.m0`, `.form.compact`, `textarea.short`, `.lead`. Use these, not inline `style`. Inline style is only for values computed at runtime, such as a meter's width.

## Rules

- **Words:** plain and short. Say what happened and what to do next ("Not saved. Tap Try again."). Never show raw error codes; `friendlyError()` in shared turns them into sentences.
- **Every screen that loads data has all three states:** loading, empty (with the next step when there is one) and error.
- **Touch:**
  - On phones, nothing tappable is smaller than 44–48 dp. On the web, touch screens get 44 px targets.
  - Destructive actions ask first (removing a photo, deleting an unsent report).
- **Keyboard and screen readers:**
  - Web pages set a title (`useTitle`), have a skip link and focus the page on navigation.
  - Tabs follow the WAI-ARIA pattern (arrow keys, Home, End).
  - Buttons always have a `type`. Every input has a label.
  - Mobile headings are marked as headers, fields read their label, and buttons with symbols (−, +, ✕) have spoken labels.
- **Offline:** never hide that something has not reached the office. The phone shows Offline, Syncing or Not saved until it has.
- **Changes:** extend what exists before adding a new pattern. If a new pattern is needed, add it here.

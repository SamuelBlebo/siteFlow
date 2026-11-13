# Simpler navigation, "+ New" and responsive layout: design

**Date:** 13 November 2026
**Status:** approved in conversation, part by part; waiting for review of this written version.
**Scope:** the web app only (`apps/web`). The phone app is unchanged.

## Why

The owner wants SiteFlow to be as easy to get around as other project management apps, and to work well on every screen size, for both groups of users:
- owners and managers on laptops, looking after several projects and the money;
- foremen and supervisors on phones, working on one or two projects.

**Today:**
- The sidebar has 8 menu items in 4 groups.
- A project page has up to 11 tabs.
- To add anything, you first open the right project and then the right tab.
- The layout switches at a single point (860 px), with about 10 other screen widths used inconsistently across pages. As a result:
  - an upright iPad gets the phone layout;
  - small laptops get a cramped full sidebar;
  - wide screens are left with empty space.

**Success:**
- A new owner finds everything without being shown around.
- Site staff add a report, an issue, attendance or a delivery in 2–3 taps from anywhere.
- No page scrolls sideways at any width from 320 px up.

## Fixed constraints

- No feature is removed; only where things live changes.
- Every role sees exactly what it can see today.
  - Permissions stay in `packages/shared/src/permissions.ts` and the rules, with no rule changes.
  - Modules that are switched off still hide their parts.
- Old links keep working, including links in emails and WhatsApp messages already sent.
- No data model, security rule or Cloud Function changes.

## Part 1: menus

### Sidebar (laptop) and the More sheet (phone)

| Before | After |
|---|---|
| Dashboard | **Home** (`/`) |
| Projects | **Projects** (`/sites`) |
| Daily reports (`/reports`), Issues (`/issues`) | **Site activity**: one page with two tabs, *Reports* and *Issues*. `/reports` and `/issues` both stay and open their tab |
| Finance (`/finance`) | **Money** (`/finance`) |
| Team (`/team`) | **Team** (`/team`) |
| Modules, Reminders, Company | **Settings**: one link at the bottom of the sidebar. It opens a page with tabs *Company*, *Modules*, *Reminders*. `/company`, `/modules` and `/reminders` all stay and open their tab |

**Unchanged in the sidebar:**
- The project list under the menu (pinned projects first, a red dot when today's report is missing).
- The company switcher.
- The account link.

**Site staff** (supervisor, viewer) see what they see today: *My projects* and their account. The phone Report button is replaced by "+ New" (part 2).

### Project page: from 11 tabs to 5

| Tab | Sections inside (a small switch at the top of the tab) | Who sees it |
|---|---|---|
| **Today** | Site staff: Live today first, then the overview. Others: the AI overview and key facts | Everyone |
| **Reports** | *Daily reports* · *Photos* | Everyone |
| **Progress** | *Programme* · *Issues* | Everyone |
| **Resources** | *Materials* · *Labour* · *Drawings and 3D model* | Each section follows its module (Materials, Labour). Drawings always show. Everyone sees the tab |
| **Money** | Budget and expenses | `finance.view` and the Budget module on |

- **Team** and **Settings** move into a **⋯** menu next to *Edit project*. They're shown only to the roles that have them today (`team.manage` / `sites.manage`).
- **Which tab a project opens on:** Today, for everyone. Site staff see Live today at the top of it, as they do now.

### Addresses

- The project page uses `?tab=<tab>&view=<section>`.
- Every old `?tab=` value is mapped to its new home. This extends the existing `OLD_TABS` in `SiteDetail.jsx`:

| Old | New |
|---|---|
| `today`, `overview`, `drawing` | `today` (`drawing` goes to `resources` / `drawings`) |
| `reports`, `report`, `history` | `reports` / `reports` |
| `photos` | `reports` / `photos` |
| `progress` | `progress` / `programme` |
| `issues` | `progress` / `issues` |
| `materials` | `resources` / `materials` |
| `labour`, `workers` | `resources` / `labour` |
| `budget` | `money` |
| `team`, `settings` | still work, and open that view, reached from the ⋯ menu |

- The other parameters keep working: `write=1`, `request=1` and `edit=1`.
- If a tab or section can't be shown (no permission, or its module is off), the address falls back to Today and shows no error.

## Part 2: the "+ New" button

**Where it appears:**
- **Laptop and tablet:** a **＋ New** button in the top bar, on every page inside the app.
- **Phone:** a round **＋** in the middle of the bottom bar, for every role that has at least one choice. It opens the menu; it never jumps straight to a form.

**Choices** (only those the person can use, with their modules on):

| Choice | Shown when | Opens |
|---|---|---|
| Daily report | `site.work` | project → `reports`, `write=1` |
| Issue | `site.work` (the same check the Issues tab uses) | project → `progress`/`issues`, `new=issue` |
| Attendance | `site.work` and Labour on | project → `resources`/`labour`, `new=attendance` |
| Material delivery | `site.work` and Materials on | project → `resources`/`materials`, `new=delivery` |
| Expense | `finance.edit` and Budget on | project → `money`, `new=expense` |
| Project | `sites.manage` | `/sites/new` |

**Choosing the project:**
- If you're on a project page, it's that project.
- If you have exactly one open project, it's that one.
- Otherwise a short list of your open projects appears (pinned ones first) to pick from.
- Closed projects never appear, because they can't take new records.

**Forms:** the existing forms are reused, opened by the `new=` parameter, the same way `write=1` opens the report form today (`TodayReport startOpen`). Nothing is copied into a pop-up. After saving, you stay on the project page where the new item shows.

## Part 3: screen sizes

**Four sizes, used across the whole stylesheet** (`apps/web/src/styles.css`). The current scattered widths are replaced by these four.

| Size | Width | Menu | Content |
|---|---|---|---|
| Phone | < 640 | Bottom bar with ＋ in the middle; More sheet | One column; tables become cards; menus and the ＋ menu slide up from the bottom |
| Tablet | 640–1023 | **Icon-only sidebar**: names show on hover, and a button expands it | Two columns where it helps; tables become cards below 768 |
| Laptop | 1024–1439 | Full sidebar, which can be **collapsed to icons**; the choice is remembered on that device | Tables, 2–3 column grids |
| Wide | ≥ 1440 | Full sidebar | **A side column** on Home and the project Today tab (alerts, today's checklist) instead of stacking everything; lines of text don't stretch past a readable width |

The collapsed-sidebar choice is stored in `localStorage`, inside try/catch, and defaults to expanded.

**Rules for every page:**
- No sideways page scroll at any width from 320 px.
- Buttons and links at least 44 px tall on touch screens (`pointer: coarse`).
- **The 17 tables:**
  - Lists (reports, expenses, materials, team, notifications, admin) become cards below 768.
  - Wide grids (attendance sheet and history, wage sheet) scroll inside their own box, with the first column fixed.
- Long project, company and people names are shortened with "…" and shown in full on hover.
- Page headers (title, search, buttons) wrap onto two lines instead of squeezing.

## Part 4: testing and build order

### Testing

- **One shared file for the rules**, for example `packages/shared/src/navigation.ts`: pure functions that return the sidebar items, the project tabs and sections, the ＋ New choices and the old-address mapping for a role, its permissions and the company's modules. Unit tests cover every role, with modules on and off, and every old address.
- **Screens:** there are no automated layout tests today (`docs/TESTING.md`). Each pull request is checked by hand in the browser at 360, 390, 768, 1024, 1280 and 1920 px, looking for sideways scroll and overlap. Screenshots go in the pull request.
- **Existing checks:** all current CI checks must pass on every pull request.

### Build order: six pull requests, each safe to release alone

1. The shared navigation rules and their tests. Nothing visible changes.
2. Project page: 5 tabs with sections, the ⋯ menu, old addresses mapped.
3. Sidebar and More sheet: Site activity, Money, the Settings page with tabs.
4. ＋ New: the button, the menu, the project picker, and the `new=` parameters on the forms.
5. Four screen sizes in the shell: icon-only sidebar on tablets, collapsible sidebar on laptops, breakpoints brought into line.
6. Page by page: tables as cards or contained scrolling, headers, the wide-screen side column, the 320 px check.

## Not in scope

- The phone app (`apps/mobile`).
- A new visual style, a command bar (Ctrl+K) or drag-and-drop boards. These were Approach 2, which was not chosen.
- New features, or any change to data, rules or functions.

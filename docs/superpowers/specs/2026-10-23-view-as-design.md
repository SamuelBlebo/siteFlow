# View as: see the app as another role or person

Date: 2026-10-23. Status: design, awaiting approval.

## Why

Two uses, from the owner (the person who runs SiteFlow):

1. **Demos.** Mostly this. Walking a prospect through the sample projects, switching between owner, project manager, supervisor and so on, to show what each person on their team would see.
2. **A client company's owner checking their team's view.** "What does my foreman see?" before they invite one, or when someone says "I can't find X".

A later stage (not this one) lets the owner allow or disallow things per role ("my supervisors can see budgets"). View as is how they will check those changes, so it should not need rework when that arrives.

## What it is

A preview. The person keeps their own login and their own access; the screens redraw as if they were someone else. Nothing is saved, and nothing the preview does changes what the server allows.

## Goals

- **Who can use it:** anyone with `team.manage` in the current company (owner and admin). Everyone else never sees it.
- **Two ways to pick:**
  - **By person:** pick a team member ("View as Kofi Mensah, Site supervisor"). The app uses that member's role and their assigned projects (`siteIds`).
  - **By role:** pick one of the roles. For site-scoped roles (supervisor, viewer) the preview shows **all** the company's projects, so nothing is hidden by accident. *(Our call; a project picker can come later.)*
- **What can be picked:** the same rule as giving roles (`assignableRoles`): the owner can view as admin and below; an admin as manager and below. Nobody views as the owner. People listed follow the same rule, and switched-off members are not listed. *(Our call.)*
- **Where:** a "View as" entry in the account menu (TopBar `UserMenu`) opens a small chooser: a list of roles, then the team list with a search.
- **While previewing:** a bright bar across the top of every page: "Viewing as Site supervisor" or "Viewing as Kofi Mensah (Site supervisor)", with **Switch** and **Back to my view**. The sidebar, phone bottom bar, pages, tabs, tiles and money figures all follow the previewed role and projects, exactly as `useAuth().can`, `role` and `profile.siteIds` already drive them.
- **Look-only:** saving anything is blocked while previewing. Writes go through `apps/web/src/lib/` (`account.js` `call`, `db.js`, `cover.js`, `drawings.js`, `model.js`, `hooks.js`); a single check there refuses the write with a toast: "You're viewing as {who}. Go back to your view to make changes." Buttons stay visible, so the preview looks real.
- **Pages the previewed role can't open** redirect as they would for that person (the existing `Guard perm` redirect to `/sites`).
- **Instant and temporary:** switching, or going back, is immediate. Held in memory only: a reload, sign-out or company switch ends the preview. *(Our call.)*

## Decisions from review

- **"My" items follow the person.** By person means exactly their screens, so anything a screen shows as "mine" (today's report and draft, issues assigned to me, report requests and change requests sent to me, "mine" in report and issue detail) uses the previewed member's uid. `useAuth` exposes a `me` uid: the previewed member's in person mode, the real user's otherwise. Screens filtering by `user.uid` for "my" content switch to `me` (about 10 screens). In role mode, `me` stays the real user. *(Our call, following "exactly what Kofi sees".)*
- **Server answers shaped by role follow the preview.** Callables that shape what they return by the caller's role (at least `aiOverview`; the builder checks the rest) take an optional preview role and use it only if it is narrower than the caller's real role. The server never widens access. *(Our call.)*
- **The guard covers company data only.** The real user's own settings still save while previewing: pins, skin, light or dark, account page, email settings. Everything else written through `lib/` (company data, sites, reports, issues, members and the like) is refused with the toast. *(Our call.)*
- **The guard is per write, not on `call` as a whole.** Read-only callables (`inviteInfo`, `emailSettings`, `aiOverview` and similar) keep working in a preview. *(Our call.)*
- **Platform admin.** No special View as rights: it needs `team.manage` in the current company like anyone else. While previewing, the "Admin" menu link is hidden so a demo looks real. *(Our call.)*
- **Ready for the later per-role stage.** Screens keep asking `useAuth().can`, so when companies get their own permission settings, `can` reads them and the preview uses the same path with no rework. *(Our call.)*

## Non-goals

- Changing what any role is allowed to do (the later stage).
- Seeing the person's private things: their email settings, pinned projects, skin, account page, notifications. The account page shows the real user, and the preview keeps the real user's look. *(Our call.)*
- Mobile app. Demos and owner checks happen on the web app. *(Our call; can follow later.)*
- Logging previews to the activity log.

## Anti-goals (a failure even if it works)

- **Any extra access.** The preview must never let someone see or do more than their own login allows. It only ever narrows the screens; the security rules are untouched and still enforce the real user's role.
- **Anything saved as the previewed person by mistake** during a demo.
- **Getting stuck.** "Back to my view" is always one tap away, on every page, including phone width.
- **A preview that lies.** If a screen shows something the real role would not see (because the owner's login can read more), that's a bug. Screens must get role and projects from `useAuth`, not from elsewhere.

## Constraints

- Follow the existing app: React, `useAuth()` from `apps/web/src/auth/AuthProvider.jsx`, `can`/`isSiteScoped`/`assignableRoles` from `@siteflow/shared`, existing components and styles (light look and skins), `toast`, the confirm pattern.
- The override sits in `AuthProvider`: while previewing, `role`, `can`, `profile.role` and `profile.siteIds` come from the preview; `user`, `cid`, `company` and the account fields stay real. Screens need no changes unless they read role or projects some other way (check and fix those).
- Must work at phone width (the bar, the chooser).
- Web integration tests stay green; add tests for: who can preview, the picking rule, the override (role, `can`, `siteIds`), writes refused while previewing, and the preview ending on company switch.

## Left to the builder

- Exact look of the bar and chooser, within the existing design.
- How the write guard is wired (one helper the `lib/` files call is the expected shape).
- Where the preview state lives inside `AuthProvider` and what it exposes (e.g. `viewAs`, `startViewAs`, `stopViewAs`).

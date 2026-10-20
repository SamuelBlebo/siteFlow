# Light look and skins

Agreed with the owner on 2026-10-20, from a reference screenshot (a light logistics dashboard) and three rounds of mockups.

## Intent

SiteFlow keeps every page and feature it has today; only the look changes. The new look is light and calm, like the reference: white cards floating on a soft grey ground, rounded corners, thin borders, a white sidebar grouped under small headings, and a slim top bar. Colour is kept minimal so the few coloured things mean something.

## Decided by the owner

- Adopt the reference UI, keep SiteFlow's pages, dashboard and content.
- Keep the logo: the hazard-tape mark and the Goldman wordmark.
- Charts stay: weekly spend bars, where the money goes (ring/pie), budget against progress, workforce by project, issues by priority.
- Minimal colour: greys for normal things, one accent for what should catch the eye, red only for problems.
- Three skins, chosen by each person: **Amber**, **Brass**, **Navy**. New people start on **Brass**.
- The person is shown both at the bottom of the sidebar and at the top right; the top-right one opens a menu (account, email settings, skin, light/dark, sign out).
- The sidebar stays fixed while the page scrolls, like most apps.
- The mobile app gets the same look and skins.

## Builder's calls (not discussed; open to change)

- The skin is an accent swap only. Each skin sets the accent, its soft background and the text on it, in light and dark. Everything else is shared.
- The skin is remembered on the device straight away and saved on the person's profile (`users/{uid}.skin`), so it follows them to another browser or the phone.
- Status green stays for real success marks (switches, checkmarks, done steps) but ordinary "sent / on track" labels turn grey.
- The dashboard gets a "Your projects" strip at the top: one card per active project with its progress, stage and state, and the one that needs attention highlighted in the accent (the reference's truck bays).
- Folded in from the 7.5/10 review: Needs your attention above the charts, report rows with photo thumbnails and the work as the main text, Not assigned in red, matching status labels, money columns right-aligned with tabular digits, "Today" tab renamed "Live today", long project names cut short in the sidebar, Sample labels hidden in the sidebar, darker muted grey.

## Not doing

- No page, feature or permission changes. No new data except the `skin` field.
- No company-wide skin; it is per person.

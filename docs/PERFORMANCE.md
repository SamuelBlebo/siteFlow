# Performance notes

What SiteFlow reads, writes and downloads, and why. Stage 14 audit, October 2026.

## Changes made

| Area | Before | After |
| --- | --- | --- |
| Spending totals (`recalcSiteSpending`) | Read every expense of the site on each expense write (2,000 expenses = 2,000 reads per write) | Firestore sum/count aggregations: about 1 read per 1,000 expenses, per category touched. Still a full recount, so a repeated trigger cannot double count |
| Budget tab expense list | Listened to the latest 500 expenses, filtered in the browser | Downloads the last six months only (what the chart and default list show); "All" fetches older ones when chosen |
| Report lists ("Show more") | Raised the query limit, which downloaded every earlier page again | Cursor pages (`usePagedQuery`): the first page stays live, and older pages are fetched once, after the last item shown |
| Photo thumbnails | Lists showed the full 1600 px photo (~200–500 KB each) | A ~360 px copy (~20–40 KB) is stored next to each photo (`thumbs`); the full photo downloads only when opened. Older records fall back to the full photo (`photoThumb`) |
| Phone photo size | Resized to 1600 px wide, so portrait photos came out 2,133 px tall | Long edge 1,600 px, same as the web |
| Web download | One 1,072 KB file (278 KB gzipped) | Pages load when opened. App code is 36 KB; React and Firebase are separate files the browser keeps across updates; Storage (51 KB) loads only when a photo is uploaded. First load is about 233 KB gzipped |
| Re-renders | Auth, site and site-data values were rebuilt on every render | Memoised, so screens re-render only when their data changes |

## Reads, by screen

- **Dashboard** (managers): sites, open issues, the last two weeks of reports (max 500), and the last 100 issues. Per open site, live: materials, today's material entries, today's attendance, milestones, and finance (finance roles only). These listeners only cost reads when something changes. With many sites (50+), the next step would be a per-site summary document kept by a trigger.
- **Site workspace / phone:** one site's materials, workers, today's entries, today's attendance and milestones, live. Pay only for finance roles.
- **Reports, issues, notifications and activity:** always limited (`limit`) and filtered by date in the query, never whole collections.
- **Phone:** the Firestore cache is unlimited and kept on disk, so reopening the app reads from the phone first.

## Writes

- Each user action is one write or one batch.
- Report ids (`{date}_{uid}`) and ids made on the phone make retries overwrite instead of duplicating.
- Totals are written only by the server.

## Photos

| Copy | Size | Quality | Typical file |
| --- | --- | --- | --- |
| Photo | 1,600 px long edge | JPEG 0.7 | ~200–500 KB |
| Thumbnail | 360 px | JPEG 0.6 | ~20–40 KB |

- Both are made on the device before upload.
- On the phone, both are kept privately until sent, then removed.

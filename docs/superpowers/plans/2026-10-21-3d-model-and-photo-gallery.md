# 3D Model and Photo Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Managers can upload the architect's 3D model (IFC or GLB/glTF) to a project and everyone on it can turn it around in the browser. Every report photo shows in a gallery grouped by week, so progress reads at a glance.

**Architecture:** Pure rules (file checks, gallery grouping) live in `@siteflow/shared` with unit tests. Firestore and Storage rules get a new `model` site field and a `model/` storage folder, both covered by emulator tests. The web app adds a lazily loaded three.js viewer (web-ifc for IFC) on the Overview, plus a `PhotoGallery` component used by a new project "Photos" tab and a "Photos" view on the Reports page. The full-screen viewer is pulled out of `PhotoViewer` and shared.

**Tech Stack:** React 19, Vite 5, Firebase 12 (Firestore, Storage), three.js, web-ifc, vitest, Firebase emulators.

**Spec:** `docs/superpowers/specs/2026-10-21-3d-model-and-photo-gallery-design.md`

## Global Constraints

- Accepted model files: `.ifc`, `.glb`, `.gltf` (case-insensitive extension check). Model limit **100 MB**.
- Refusal copy for `.rvt` / `.skp`: "SiteFlow can't open Revit or SketchUp files. Ask your architect for an IFC or GLB export."
- Storage content types: IFC `application/octet-stream`, GLB `model/gltf-binary`, glTF `model/gltf+json`.
- Only managers (`siteManager` in the rules, `can('sites.manage')` in the app) write the model; everyone on the project (`onSite`) reads it.
- One model per project; a new upload replaces the old one, and the old file is deleted only **after** the site document points at the new one.
- three.js and web-ifc versions are pinned exactly (no `^`), and each is a release at least two weeks old. Both are loaded with dynamic `import()` only when the viewer opens.
- The viewer background is light (soft grey with a faint grid) in light **and** dark mode.
- The gallery reads existing reports only. It adds no new fields and writes nothing.
- Web only. No mobile app changes.
- Commits: conventional (`feat(web): …`, `feat(shared): …`, `feat(rules): …`), **no Co-Authored-By trailer**, push after each task.

## Review Focus

1. **A model that won't parse, or that is huge on a phone.** The card shows "Could not open this model. Try a GLB or IFC export from your architect." and the rest of the Overview keeps working. Covered in Task 3 Step 5 (a manual check with a corrupt file).
2. **Upper-case or doubled extensions** (`HOUSE.IFC`, `plan.final.glb`). These are accepted, and `model.ifc.zip` is refused. Covered in Task 1's tests.
3. **Reports whose `thumbs` is shorter than `photos`** (older records). Each photo falls back to its full URL. Covered in Task 4's tests.
4. **Week boundaries.** A Sunday report belongs to the week that started the Monday before. Covered in Task 4's tests.
5. **Photos still uploading** (`photoCount > photos.length`). Only the photos that have finished uploading show, and nothing breaks. Covered in Task 4's tests.

---

### Task 1: Model file checks (shared)

**Files:**
- Create: `packages/shared/src/logic/model.ts`
- Modify: `packages/shared/src/paths.ts` (next to `coverFile`), `packages/shared/src/index.ts`, `packages/shared/src/types.ts` (`Site`)
- Test: `packages/shared/test/model.test.ts`

**Interfaces:**
- Produces:
  - `MODEL_MAX_MB = 100`
  - `type ModelKind = 'ifc' | 'glb' | 'gltf'`
  - `checkModelFile(name: string, sizeBytes: number): { kind: ModelKind; contentType: string; ext: string } | { error: string }`
  - `paths.modelFile(cid, sid, file) => companies/${cid}/sites/${sid}/model/${file}`
  - `interface SiteModel { file: string; kind: ModelKind; name: string; sizeMb: number; uploadedBy: string; uploadedByName: string; uploadedAt?: unknown }`
  - `Site.model?: SiteModel | null`

- [ ] **Step 1: Write the failing test** `model.test.ts`:
  - `checkModelFile('House.IFC', 5e6)` returns `{ kind: 'ifc', contentType: 'application/octet-stream', ext: 'ifc' }`
  - `checkModelFile('plan.final.glb', 1e6).kind === 'glb'`, with content type `model/gltf-binary`
  - `checkModelFile('a.gltf', 1e6).contentType === 'model/gltf+json'`
  - `checkModelFile('x.rvt', 1e6)` and `checkModelFile('x.SKP', 1e6)` return `{ error: <the exact Revit/SketchUp copy> }`
  - `checkModelFile('model.ifc.zip', 1e6)` returns an error containing "IFC or GLB"
  - `checkModelFile('big.ifc', 150 * 1024 * 1024).error` contains "150 MB" and "100 MB"
  - `paths.modelFile('c','s','m.ifc') === 'companies/c/sites/s/model/m.ifc'`
- [ ] **Step 2:** `pnpm run test:shared -- model`. Expected: FAIL (import missing).
- [ ] **Step 3:** Implement `model.ts`, then export it from `index.ts` and add `modelFile` and the `Site.model` type.
- [ ] **Step 4:** `pnpm run test:shared` and `pnpm --filter @siteflow/shared typecheck`. Expected: all pass.
- [ ] **Step 5: Commit and push:** `feat(shared): 3D model file checks and storage path`.

### Task 2: Rules for the model

**Files:**
- Modify: `firebase/firestore.rules` (sites: `siteKeys()` and `validSite()`), `firebase/storage.rules` (a new match after the drawings one)
- Test: `firebase/tests/firestore.rules.test.ts`, `firebase/tests/storage.rules.test.ts` (new `describe('3D model')` next to `describe('project image')`)

**Interfaces:**
- Consumes: `paths.modelFile`, `SiteModel` (Task 1)

- [ ] **Step 1: Write the failing tests:**
  - Firestore: a manager `updateDoc(site, { model: {file:'https://firebasestorage.googleapis.com/v0/b/x/o/m.ifc', kind:'ifc', name:'House.ifc', sizeMb: 12.4, uploadedBy: USERS.manager, uploadedByName:'manager user'} })` succeeds, and so does an owner setting `{ model: null }`. These fail: `kind: 'rvt'`, `file: 'javascript:alert(1)'`, an extra key inside `model`, `sizeMb: 101`, and a supervisor setting any model.
  - Storage: a manager uploading `paths.modelFile(C1,S1,'m.ifc')` as `application/octet-stream` succeeds, and so do `model/gltf-binary` and `model/gltf+json`. These fail: `image/jpeg`, a size of 100 MB + 1 (`upload` takes a size or a byte array; follow the helper), and a supervisor upload. A supervisor read succeeds, and `OTHER_OWNER` reads fail.
- [ ] **Step 2:** `pnpm run test:rules`. Expected: the new tests FAIL.
- [ ] **Step 3:** Add `'model'` to `siteKeys()`. Then add `validSite()`: `model` is absent or null, or a map with `keys().hasOnly(['file','kind','name','sizeMb','uploadedBy','uploadedByName','uploadedAt'])`, where `file` is an https or `/` URL (like `cover`), `kind in ['ifc','glb','gltf']`, `isText(name,1,200)`, `sizeMb` is a number from 0 to 100, and `uploadedByName` is text from 1 to 100 characters. The storage match is `companies/{cid}/sites/{sid}/model/{file}`: read `onSite`, create when `resource == null && siteManager(cid)`, size `< 100 * 1024 * 1024`, contentType matches `application/octet-stream|model/gltf-binary|model/gltf\+json`. No update; delete for `siteManager`.
- [ ] **Step 4:** `pnpm run test:rules`. Expected: all pass.
- [ ] **Step 5: Commit and push:** `feat(rules): 3D model on the project`.

### Task 3: 3D model card and viewer (web)

**Files:**
- Create: `apps/web/src/lib/model.js`, `apps/web/src/components/ModelCard.jsx`, `apps/web/src/components/ModelViewer.jsx`
- Modify: `apps/web/package.json` (add `three`, `web-ifc`, pinned exactly), `apps/web/src/pages/SiteDetail.jsx:110` (render `<ModelCard cid={cid} site={site} />` right after `<ProjectDrawing …/>`), `apps/web/src/pages/SiteDetail.jsx:370` (the delete wording adds "the 3D model"), `apps/web/src/styles.css`, `firebase.json` (only if `.wasm` needs `Content-Type: application/wasm` in hosting headers)

**Interfaces:**
- Consumes: `checkModelFile`, `MODEL_MAX_MB`, `paths.modelFile` (Task 1)
- Produces:
  - `uploadModel(cid, sid, file: File, previous: SiteModel | null, { uid, name }, onProgress?: (pct) => void): Promise<SiteModel>`. This mirrors `lib/cover.js`: check the file, upload with `uploadBytesResumable` to `model-${Date.now()}.${ext}` (for a progress bar), `updateDoc(site, { model, updatedAt })`, and only then delete the previous file.
  - `removeModel(cid, sid, previous)`
  - `loadModel(container: HTMLElement, model: SiteModel): Promise<{ resetView(): void; dispose(): void }>`, in `ModelViewer.jsx`'s helper

- [ ] **Step 1:** Install `three` and `web-ifc` with exact versions: `pnpm --filter @siteflow/web add three@<x> web-ifc@<y> --save-exact`. Pick releases at least two weeks old.
- [ ] **Step 2:** Implement `lib/model.js` as described above. A thrown `checkModelFile` error uses `code: 'invalid-argument'`, like `cover.js` does.
- [ ] **Step 3:** Implement `ModelViewer.jsx`. It dynamically imports `three`, `three/examples/jsm/controls/OrbitControls.js` and `GLTFLoader`. For IFC, it imports `web-ifc` and the wasm file with `?url` (as `drawings.js` does for the pdf.js worker), calls `SetWasmPath`, and builds meshes with `IfcAPI.OpenModel` + `StreamAllMeshes`. Vertex data is interleaved position+normal (6 floats), with the placed geometry's `flatTransformation` and `color` (opacity under 1 means transparent). The camera frames the model's bounding box, and `resetView` goes back to that view. Lighting is a hemisphere light plus one directional light, on a `#eef0f3` background with a faint `GridHelper`. `dispose()` frees the geometry, materials and renderer, and closes the IFC model, on unmount. Any failure shows the Review Focus 1 copy in the card.
- [ ] **Step 4:** Implement `ModelCard.jsx`. With no `site.model`, managers see a slim panel with the spec's empty copy and an "Upload 3D model" button, and others see nothing (`return null`). With a model, the panel heading is "3D model". The sub-line reads `name · 12.4 MB · uploaded by X`, followed by an "Open 3D model" button that mounts `ModelViewer` at 480px tall (60vh on phones), plus "Reset view" and "Full screen" (`requestFullscreen` on the panel). Managers also get "Replace" and "Remove" (a `save()` + `toast` like the other panels). Uploading shows a progress bar and accepts `.ifc,.glb,.gltf`. Errors use `friendlyError`.
- [ ] **Step 5: Verify:** `pnpm run build:web` succeeds, and the main chunk doesn't grow by more than a few KB (three and web-ifc sit in their own chunks). Run `pnpm run dev:web`. On a sample project, upload a small GLB and a small IFC (for example the web-ifc example models), open each, orbit, zoom and reset. Rename a `.txt` to `.ifc` and check the error copy shows while the page keeps working. Check that a `.rvt` is refused before any upload.
- [ ] **Step 6: Commit and push:** `feat(web): upload and view the architect's 3D model`.

### Task 4: Gallery grouping (shared)

**Files:**
- Create: `packages/shared/src/logic/gallery.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/gallery.test.ts`

**Interfaces:**
- Produces:
  - `interface GalleryPhoto { url: string; thumb: string; date: string; by: string; stage: string; progress: number | null; siteId: string; siteName: string; source: 'report' | 'issue'; refId: string }`
  - `galleryPhotos(reports: Report[], issues?: Issue[]): GalleryPhoto[]`, newest first (date, then time), one entry per uploaded photo
  - `weekStart(date: string): string` (the Monday, as YYYY-MM-DD)
  - `galleryWeeks(photos: GalleryPhoto[]): { week: string; label: string; stage: string; progress: number | null; photos: GalleryPhoto[] }[]`, newest week first. `label` is `Week of 13 Oct`, and stage and progress come from the latest **report** photo that week (the stage is `''` when the week has only issue photos).
  - `thenAndNow(photos: GalleryPhoto[]): GalleryPhoto[]`: the first photo, then the first photo of each later month, then the latest, oldest first, with no repeats. It returns `[]` when there are fewer than 3 photos.

- [ ] **Step 1: Write the failing tests:**
  - A report with `photos:[a,b]` and `thumbs:[ta]` gives thumbs `ta` and `b`.
  - A report with `photoCount: 3` and `photos:[a]` gives 1 photo.
  - Issue photos carry `source:'issue'`, `refId` = the issue id, and `progress: null`.
  - `weekStart('2026-10-18')` (a Sunday) is `'2026-10-12'`, and `weekStart('2026-10-12')` is `'2026-10-12'`.
  - In `galleryWeeks`, the label for week `2026-10-12` is `'Week of 12 Oct'`, and the stage and progress come from that week's latest report.
  - `thenAndNow` on 2 photos is `[]`. On photos from 3 Aug, 20 Aug, 2 Sep, 15 Sep and 10 Oct, it returns 3 Aug, 2 Sep, 10 Oct (the first of each month, with the latest being October's first).
- [ ] **Step 2:** `pnpm run test:shared -- gallery`. Expected: FAIL.
- [ ] **Step 3:** Implement. Format the label with the existing date helpers in `dates.ts` where one fits. Otherwise build `d MMM` with `Intl` in UTC.
- [ ] **Step 4:** `pnpm run test:shared` and the typecheck. Expected: pass.
- [ ] **Step 5: Commit and push:** `feat(shared): photo gallery grouping`.

### Task 5: Photo gallery (web)

**Files:**
- Create: `apps/web/src/components/Lightbox.jsx`, `apps/web/src/components/PhotoGallery.jsx`
- Modify: `apps/web/src/components/PhotoViewer.jsx` (uses `Lightbox`, with no change in behaviour), `apps/web/src/pages/SiteDetail.jsx:62` and `:113` (a `['photos', 'Photos']` tab after Daily reports), `apps/web/src/pages/Reports.jsx` (a third view, `photos`, next to the projects/list views, remembered under `sf.reportsView`), `apps/web/src/styles.css`

**Interfaces:**
- Consumes: `galleryPhotos`, `galleryWeeks`, `thenAndNow` (Task 4); `siteReportsQuery`, `companyReportsQuery`, `siteIssuesQuery`, `companyIssuesQuery`, `usePagedQuery` (existing)
- Produces:
  - `<Lightbox items={[{ url, caption?, link?: { to, label } }]} index onIndex onClose />`, which does what `PhotoViewer`'s viewer does today, plus the caption line and link, and left and right swipe (pointer events, a 50px threshold)
  - `<PhotoGallery reports hasMore loadingMore onMore issues? showSite? />`

- [ ] **Step 1:** Pull `Lightbox` out of `PhotoViewer`. Report photos still open, use arrow keys and close as before (check on a report page).
- [ ] **Step 2:** Implement `PhotoGallery`. It has a "Show issue photos" chip (off by default) and a "Then and now" row (hidden when empty). Each week is a section with the heading `Week of 12 Oct · Blockwork · 42%` (leaving out the parts that are missing). The grid is `repeat(auto-fill, minmax(140px, 1fr))`, square tiles with `object-fit: cover` and lazy images. A tile opens the Lightbox at its index across all the shown photos, with the caption `prettyDate · by · stage` (plus the project name when `showSite`). The link is "View report" or "View issue", to the existing routes. Below the grid is a "Load earlier photos" button while `hasMore` is true, and the spec's empty copy shows when there are no photos.
- [ ] **Step 3:** For the project tab, use `usePagedQuery(() => siteReportsQuery(cid, sid, 60), …, 60)`, and load issues only when the chip is on. For the Reports page view, use the page's existing filters (site, period) with a page size of 60, pass `showSite`, and use `companyIssuesQuery` when the chip is on (filtered to the selected site in memory).
- [ ] **Step 4: Verify:** `pnpm run build:web` succeeds. In `dev:web` with sample data, check the Photos tab shows week headings with stage and progress, the then-and-now row, Lightbox arrows and swipe (in a phone-size window), "View report", issue photos toggling, and a project with no photos showing the empty copy. On the Reports page, check the Photos view works with the site filter.
- [ ] **Step 5: Commit and push:** `feat(web): project photo gallery`.

### Task 6: Ship to dev

- [ ] **Step 1:** `pnpm test` passes in full (shared, rules, functions, web integration).
- [ ] **Step 2:** `pnpm run deploy:rules`, then deploy hosting the way the last releases did (`firebase deploy --only hosting --project dev` after `build:dev`). On dev, check one IFC upload, opening it on a phone, and the Photos tab on a sample project.
- [ ] **Step 3:** Add a short note to `docs/DESIGN.md` covering the 3D model card and the gallery. Commit and push: `docs: 3D model and photo gallery`.

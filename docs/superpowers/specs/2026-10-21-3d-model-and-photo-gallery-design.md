# 3D model and project photo gallery

Agreed with the owner on 2026-10-21. Two features, built in this order: the 3D model first, then the gallery.

## 1. The architect's 3D model

### Intent

Owners often get a 3D model from their architect. SiteFlow already shows the architect's 2D drawings on a project's Overview; the owner should be able to upload the 3D model too, when there is one, so everyone on the project can turn it around in the browser and see what is being built. It is the lighter, owner-friendly version of Procore's Models tool: no BIM staff or Navisworks plugin, just upload the file the architect sent.

### Decided by the owner

- An option to upload the architect's 3D model, when one is available.
- Accepted files: **IFC** (the open BIM export from Revit, ArchiCAD and most architecture tools) and **GLB / glTF** (the export from SketchUp, Blender and most 3D tools).
- Revit (.rvt) or SketchUp (.skp) files are refused with a plain message: ask the architect for an IFC or GLB export.
- It lives on the project's Overview as a **"3D model"** card, under the existing Project drawing card.
- Owners, admins and project managers (the people who can manage the project, `sites.manage`) upload and replace it. Everyone on the project can view it.
- Viewing: orbit, zoom, pan, and a reset view button. Phones get the same view-only viewer in the web app.
- Not in this version: linking issues to parts of the model, measuring, comparing versions, hiding or isolating parts.

### Builder's calls (not discussed; open to change)

- **One model per project.** Uploading a new one replaces the old one (the old files are deleted).
- **Where it is stored:** the files in Storage under `companies/{cid}/sites/{sid}/model/{file}` (a new `paths.modelFile`), the details on the site document as `site.model = { file, fileType, name, sizeMb, uploadedBy, uploadedByName, uploadedAt }`. The Firestore rules for sites must allow the new `model` field (managers only); the Storage rules get a new match like the drawings one.
- **Size limit 100 MB.** IFC files are large; above that the upload is refused with the size in the message.
- **File type check by extension** (`.ifc`, `.glb`, `.gltf`), because browsers give IFC files no reliable content type. Stored with content type `application/octet-stream` for IFC, `model/gltf-binary` for GLB, `model/gltf+json` for glTF. A `.gltf` that points at separate `.bin` or texture files will not load; the message asks for GLB in that case.
- **Viewer libraries:** three.js for the viewer and GLB/glTF, web-ifc (through three.js's IFC loader or `web-ifc-three`) for IFC, all with exact pinned versions. They are loaded only when someone opens the 3D card (they are large), like pdf.js is for drawings.
- **The card does not load the model until asked.** It shows the file name, size and who uploaded it, with an "Open 3D model" button, so the Overview stays quick on site data connections. Opening shows the viewer in the card, with a full-screen button.
- **Empty state:** managers see "Upload the architect's 3D model (IFC or GLB), if you have one." Everyone else sees nothing, so a project without a model shows no empty card.
- **Light look:** the viewer has a white/soft grey background with a faint ground grid, in both light and dark mode, so models look the way architects export them.
- **Delete project** already deletes everything under the project; the wording on Settings adds "the 3D model".
- **Mobile app:** not in this version. The app shows nothing for the model yet.

## 2. Project photo gallery

### Intent

Today a report's photos are shown only inside that report, so seeing how a project has moved along means opening reports one by one. The gallery puts every report photo in one neat place, in date order, so an owner can scroll and watch the building grow.

### Decided by the owner

- A gallery of all the images added to reports, presented neatly, showing progress so far.
- Owner accepted the suggestion: a **"Photos" tab** on each project, next to Daily reports.

### Builder's calls (suggested in chat and accepted with "continue"; open to change)

- **Also on the Reports page**, across all projects, with the existing project filter. Shown as a "Photos" view next to the report list.
- **Layout:** a grid of thumbnails grouped **by week**, newest first. Each week has a heading such as "Week of 13 Oct · Blockwork · 42%", taken from the latest report that week (its stage and progress).
- **Opening a photo:** full size, with the date, who took it and the stage, and a "View report" link. Arrow keys and swipe go to the next and previous photo. Reuse the existing `PhotoViewer` where it fits.
- **"Then and now" strip** at the top of the project tab: the first photo, the first photo of each month, and the latest, in one scrolling row. Hidden when the project has fewer than 3 photos.
- **Sources:** daily report photos. Issue photos are included only when a "Show issue photos" toggle is on (off by default), so the gallery stays about progress. Issue photos open with a "View issue" link instead.
- **Thumbnails** use the report's `thumbs` where they exist, the full photo otherwise. Photos still uploading (`photoCount` above `photos.length`) are skipped.
- **No new data.** The gallery reads the reports that are already stored. It loads reports page by page (newest first, about 60 reports at a time) with a "Load earlier photos" button, rather than all at once.
- **Who sees it:** the same people who can see the project's daily reports.
- **Empty state:** "No photos yet. Photos added to daily reports will show here."
- **Mobile app:** not in this version.

## Not doing (both features)

- No changes to how reports, drawings or photos are taken or stored.
- No mobile app screens in this round.
- No photo captions, tags or editing.

## Done looks like

- A manager uploads an IFC and a GLB on dev, and a site person opens each and turns it around on a laptop and a phone.
- A Revit file and a 150 MB file are refused with clear messages.
- Firestore and Storage rules tests cover the new `model` field and the model files (managers can write, others only read, nobody outside the project can read).
- The Photos tab on a sample project shows weeks with stage and progress headings, the then-and-now strip, and the viewer moves through photos with the arrow keys.
- Each feature is committed and pushed on its own, then deployed to dev.

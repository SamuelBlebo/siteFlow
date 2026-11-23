# Every Account Has Its Own Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every account owns a company: invitees get one when they accept, older accounts can create one in a click, and the switcher lists it first.

**Architecture:** The company-creation writes in `createCompany` move into one helper that `acceptInvite` also calls (invitations only, after the person agrees to the Terms). The web app adds the terms checkbox to the invitation page, a "Create your own projects" card and New-menu item for accounts without their own company, and orders the switcher.

**Tech Stack:** Firebase Cloud Functions (TypeScript), Firestore, React (Vite), zod schemas in `@siteflow/shared`, vitest against the emulators.

**Spec:** `docs/superpowers/specs/2026-11-23-own-space-for-every-account-design.md`

## Global Constraints

- An owner's company id is their uid. One owned company per account.
- Own company name: `"<first name>'s projects"` (first word of the person's name). Country, currency and time zone copied from the inviting company.
- Terms are recorded on the company exactly as `createCompany` does: `terms: { version: TERMS_VERSION, acceptedBy: uid, acceptedAt }`.
- `companyId` (the company the person opens) stays on the inviting company after accepting.
- Password-reset links (`kind: 'reset'`) never need terms and never create a company.

## Review Focus

- Accepting twice / retry after a half-failed accept: the own company is created once, never duplicated (Task 2 test).
- A reset link for someone with no own company: no company created, no terms required (Task 2 test).
- An invitee who already owns a company (added to a second company by email): accepting leaves their own company untouched (Task 2 test).
- Invite accepted without ticking terms: refused with a message naming the Terms (Task 2 test).
- Switcher with exactly two companies (own + inviting): own listed first, labelled "Your projects · Owner" (Task 4 manual check).

---

### Task 1: Terms on the invitation input

**Files:**
- Modify: `packages/shared/src/schemas.ts:187`
- Test: `packages/shared/test/schemas.test.ts` (add to the existing file; create the `describe` if absent)

**Interfaces:**
- Produces: `acceptInviteInput` = `{ token, password, acceptTerms?: true }`

- [ ] **Step 1: Write the failing test**

```ts
it('acceptInviteInput takes an optional acceptTerms that must be true', () => {
  const base = { token: 'a'.repeat(43), password: 'password123' };
  expect(validate(acceptInviteInput, base).ok).toBe(true);
  expect(validate(acceptInviteInput, { ...base, acceptTerms: true }).data.acceptTerms).toBe(true);
  expect(validate(acceptInviteInput, { ...base, acceptTerms: false }).ok).toBe(false);
});
```
(Use the token length/shape the existing `inviteToken` accepts; copy from an existing invite test if one exists.)

- [ ] **Step 2: Run it to see it fail:** `pnpm --filter @siteflow/shared test -- schemas` → FAIL on the `false` case or the data assertion.
- [ ] **Step 3:** Add `acceptTerms: z.literal(true).optional()` to `acceptInviteInput`.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5: Commit** `feat(shared): invitation can carry agreement to the Terms`

### Task 2: acceptInvite creates the person's own company

**Files:**
- Modify: `firebase/functions/src/team.ts:69-108` (extract helper), `firebase/functions/src/invites.ts:78-120`
- Modify: `apps/web/test/join.js` (pass `acceptTerms: true`)
- Test: `apps/web/test/ownspace.test.js` (new, emulator integration, same setup style as `integration.test.js`)

**Interfaces:**
- Produces (team.ts, exported): `ownCompanyWrites(t: Transaction, db: Firestore, o: { uid: string; name: string; email: string; companyName: string; country: string; open: boolean }): Promise<'created' | 'exists'>` — reads `companies/{uid}` and `users/{uid}` inside `t`; if the company exists with `ownerId === uid` returns `'exists'`; if it exists with another owner throws `already-exists`; otherwise writes company, Owner membership and `companyIds: arrayUnion(uid)` (and `companyId: uid` only when `open`), returning `'created'`. `createCompany` calls it with `open: true`.
- Consumes: `acceptInviteInput` from Task 1.

- [ ] **Step 1: Write the failing tests** in `ownspace.test.js` (owner creates company, invites `kofi-<run>@example.com` as `supervisor` via `inviteMember`, then):

```js
it('refuses an invitation accepted without agreeing to the Terms', async () => {
  await expect(acceptInvite({ token: tokenOf(res), password: 'kofi-pass-1' })).rejects.toThrow(/Terms/);
});
it('accepting creates the invitee\'s own company once and keeps them in the inviting one', async () => {
  await acceptInvite({ token: tokenOf(res), password: 'kofi-pass-1', acceptTerms: true });
  const kofi = await as(kofiEmail, 'kofi-pass-1');
  const own = (await getDoc(companyDoc(kofi.uid))).data();
  expect(own).toMatchObject({ name: "Kofi's projects", ownerId: kofi.uid, country: 'GH', terms: { version: TERMS_VERSION, acceptedBy: kofi.uid } });
  expect((await getDoc(memberDoc(kofi.uid, kofi.uid))).data()).toMatchObject({ role: 'owner', active: true });
  expect((await getDoc(userDoc(kofi.uid))).data()).toMatchObject({ companyId: cid, companyIds: expect.arrayContaining([cid, kofi.uid]) });
});
it('a password-reset link needs no Terms and creates no company', async () => { /* owner sends resetMemberPassword for a second invitee who has no own company; accept without acceptTerms resolves; companyDoc(thatUid) does not exist */ });
it('someone who already owns a company keeps it unchanged when they accept', async () => { /* invitee who ran createCompany first (name 'Ama Works'); after accepting, own company name is still 'Ama Works' */ });
```

- [ ] **Step 2: Run:** `pnpm run test:web -- ownspace` → FAIL (no Terms error; no own company).
- [ ] **Step 3: Extract `ownCompanyWrites`** from `createCompany`'s transaction, unchanged behaviour for `createCompany` (`open: true`).
- [ ] **Step 4: Change `acceptInvite`:** when `inv.kind === 'invite'` and `acceptTerms` is not `true`, throw `HttpsError('failed-precondition', 'Agree to the Terms of Service and the Privacy Policy to join.')` before deleting the link. For invites, read the inviting company (country) and the user doc inside the transaction, and call `ownCompanyWrites` with `companyName: \`${firstName}'s projects\``, `open: false`. Firestore transactions need all reads before writes: do the helper's reads first, then the existing writes.
- [ ] **Step 5: Update `join.js`** to pass `acceptTerms: true`.
- [ ] **Step 6: Run** `pnpm run test:web` (whole suite: other tests use `join`) → all PASS.
- [ ] **Step 7: Commit** `feat(functions): accepting an invitation gives the person their own company`

### Task 3: Terms checkbox on the invitation page

**Files:**
- Modify: `apps/web/src/pages/AcceptInvite.jsx:19-64`

**Interfaces:**
- Consumes: `acceptInvite({ token, password, acceptTerms })` (`apps/web/src/lib/account`).

- [ ] **Step 1:** For `info.kind === 'invite'` only, add the same `label.agree` checkbox markup `CompanySetupForm.jsx:41` uses, worded "I agree to the Terms of Service and the Privacy Policy." Unticked on submit shows "Agree to the Terms of Service and the Privacy Policy to continue." without calling the server. Pass `acceptTerms: true` when ticked.
- [ ] **Step 2: Verify:** `pnpm --filter @siteflow/web build` succeeds; on the dev server open an invitation link, confirm the checkbox shows for an invite and not for a password link.
- [ ] **Step 3: Commit** `feat(web): agree to the Terms when joining from an invitation`

### Task 4: Own space in the switcher, Home card and New menu

**Files:**
- Create: `apps/web/src/components/OwnSpaceCard.jsx`
- Modify: `apps/web/src/auth/AuthProvider.jsx:95-103` (sort), `apps/web/src/components/Layout.jsx` (option label), `apps/web/src/components/NewMenu.jsx`, the page site roles and owners land on (`apps/web/src/pages/Sites.jsx` and `apps/web/src/pages/Dashboard.jsx`)

**Interfaces:**
- Produces: `OwnSpaceCard()` — renders nothing when `profile.companyIds` includes `user.uid`; otherwise a `.card` "Create your own projects" with `CompanySetupForm` (props `name={profile.name}`, `idPrefix="ownspace"`, `submitLabel="Create my projects"`, company name prefilled `"<first name>'s projects"`, `onDone` = the same reload-to-Home `Account.jsx` uses for `openNewCompany`).
- Produces: `companies` list from AuthProvider sorted own (`id === uid`) first, then by name.

- [ ] **Step 1:** Sort in AuthProvider: own first, then `localeCompare`.
- [ ] **Step 2:** Switcher option text for the own company: `Your projects · Owner` (both selects in `Layout.jsx`).
- [ ] **Step 3:** `OwnSpaceCard` on `Sites.jsx` and `Dashboard.jsx` above the main content; New menu item "Your own projects" (icon `projects`) shown only when the person has no own company, linking to `/account#own`.
- [ ] **Step 4: Verify:** `pnpm --filter @siteflow/web build`; on the dev server as a site supervisor without an own company, the card and New item show; after creating, they disappear and the switcher lists "Your projects · Owner" first.
- [ ] **Step 5: Commit** `feat(web): your own projects first in the switcher, and a card to create them`

import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { doc, updateDoc, type Firestore } from 'firebase/firestore';
import { paths, type Role } from '@siteflow/shared';
import { C1, C2, OFF_USER, OTHER_OWNER, S1, S2, S9, USERS, makeEnv, seed } from './setup';

let env: RulesTestEnvironment;
beforeAll(async () => { env = await makeEnv(); });
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await seed(env);
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage() as unknown as FirebaseStorage, paths.photo(C1, S1, 'r1', 'existing.jpg')), jpg, { contentType: 'image/jpeg' });
  });
});

const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const storageAs = (uid: string) => env.authenticatedContext(uid).storage() as unknown as FirebaseStorage;
const upload = (st: FirebaseStorage, path: string, type = 'image/jpeg') => uploadBytes(ref(st, path), jpg, { contentType: type });
const asRole = (r: Role) => storageAs(USERS[r]);

describe('report photos', () => {
  it('site workers upload photos to their sites', async () => {
    for (const r of ['owner', 'admin', 'manager', 'supervisor'] as const) {
      await assertSucceeds(upload(asRole(r), paths.photo(C1, S1, 'r1', `${r}.jpg`)));
    }
  });
  it('finance and viewers cannot upload', async () => {
    await assertFails(upload(asRole('finance'), paths.photo(C1, S1, 'r1', 'f.jpg')));
    await assertFails(upload(asRole('viewer'), paths.photo(C1, S1, 'r1', 'v.jpg')));
  });
  it('site-scoped users only reach assigned sites', async () => {
    await assertFails(upload(asRole('supervisor'), paths.photo(C1, S2, 'r1', 's.jpg')));
    await assertSucceeds(getBytes(ref(asRole('viewer'), paths.photo(C1, S1, 'r1', 'existing.jpg'))));
  });
  it('other companies, switched-off users and strangers get nothing', async () => {
    await assertFails(getBytes(ref(storageAs(OTHER_OWNER), paths.photo(C1, S1, 'r1', 'existing.jpg'))));
    await assertFails(upload(storageAs(OTHER_OWNER), paths.photo(C1, S1, 'r1', 'x.jpg')));
    await assertFails(upload(asRole('owner'), paths.photo(C2, S9, 'r1', 'x.jpg')));
    await assertFails(getBytes(ref(storageAs(OFF_USER), paths.photo(C1, S1, 'r1', 'existing.jpg'))));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage() as unknown as FirebaseStorage, paths.photo(C1, S1, 'r1', 'existing.jpg'))));
  });
  it('images only, no overwriting, deletes by site managers', async () => {
    await assertFails(upload(asRole('supervisor'), paths.photo(C1, S1, 'r1', 'doc.pdf'), 'application/pdf'));
    await assertFails(upload(asRole('supervisor'), paths.photo(C1, S1, 'r1', 'existing.jpg')));
    await assertFails(deleteObject(ref(asRole('supervisor'), paths.photo(C1, S1, 'r1', 'existing.jpg'))));
    await assertSucceeds(deleteObject(ref(asRole('manager'), paths.photo(C1, S1, 'r1', 'existing.jpg'))));
  });
  it('no new photos on a closed site', async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore() as unknown as Firestore, paths.site(C1, S1)), { status: 'closed' }));
    await assertFails(upload(asRole('supervisor'), paths.photo(C1, S1, 'r1', 'late.jpg')));
    await assertSucceeds(getBytes(ref(asRole('supervisor'), paths.photo(C1, S1, 'r1', 'existing.jpg'))));
  });
  it('issue photos: site workers on their sites, viewers read only', async () => {
    await assertSucceeds(upload(asRole('supervisor'), paths.issuePhoto(C1, S1, 'i1', '1.jpg')));
    await assertFails(upload(asRole('supervisor'), paths.issuePhoto(C1, S2, 'i1', '1.jpg')));
    await assertFails(upload(asRole('viewer'), paths.issuePhoto(C1, S1, 'i1', '2.jpg')));
    await assertSucceeds(getBytes(ref(asRole('viewer'), paths.issuePhoto(C1, S1, 'i1', '1.jpg'))));
    await assertFails(upload(asRole('supervisor'), paths.issuePhoto(C1, S1, 'i1', '1.jpg')));
  });
  it('everything outside report photos is closed', async () => {
    await assertFails(upload(asRole('owner'), `companies/${C1}/logo.png`, 'image/png'));
    await assertFails(upload(asRole('owner'), 'public/anything.jpg'));
  });
});

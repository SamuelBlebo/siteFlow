// Runs before any function is defined. It must be the first import in index.ts:
// imports are evaluated before the rest of a module, so options set later in index.ts
// would not apply to the functions (they would all land in the default us-central1).
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 10 }); // nearest region to Ghana

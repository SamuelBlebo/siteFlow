import firestore from '@react-native-firebase/firestore';

// Runs before anything else touches Firestore (imported first in index.js). The phone keeps its
// copy of the data and its unsent changes on disk; with no size limit, a long spell offline can
// never push unsent changes or the data a supervisor works with out of the cache.
firestore()
  .settings({ persistence: true, cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED })
  .catch((e) => console.warn('Could not set offline storage', e));

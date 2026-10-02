// Entry file. In a monorepo, expo/AppEntry.js may live in the root node_modules,
// so we register the app ourselves.
import './src/lib/firestoreSetup'; // offline storage settings, before any other Firestore use
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

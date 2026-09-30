// Entry file. In a monorepo, expo/AppEntry.js may live in the root node_modules,
// so we register the app ourselves.
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

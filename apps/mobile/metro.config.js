// Expo SDK 52+ detects npm workspaces automatically: it watches the repo root
// and resolves @siteflow/shared from packages/shared. Nothing extra is needed.
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);

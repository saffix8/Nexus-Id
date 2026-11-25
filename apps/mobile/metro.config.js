const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration — apps/mobile is a standalone install (not in the root
 * npm workspace: it needs React 19, apps/web is on React 18). The shared
 * packages are linked with file: and watched here.
 * The on-device SD-JWT holder lives in src/crypto/holder.ts (Hermes-safe
 * mirror of packages/sd-jwt/src/holder.ts), so @nexusid/sd-jwt is not bundled.
 */
const root = path.resolve(__dirname, '../..');
const local = path.resolve(__dirname, 'node_modules');

const config = {
  watchFolders: [
    path.join(root, 'packages/types'),
  ],
  resolver: {
    nodeModulesPaths: [local],
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

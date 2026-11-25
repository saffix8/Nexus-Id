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
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const config = {
  watchFolders: [path.join(root, 'packages/types')],
  resolver: {
    nodeModulesPaths: [local],
    // Hierarchical lookup stays ON so nested deps resolve (e.g. reanimated's own
    // node_modules/semver v7). The root workspace node_modules (React 18) is
    // blocked instead, so nothing from apps/web's tree can leak into the bundle.
    blockList: [new RegExp(`^${escape(path.join(root, 'node_modules'))}/.*`)],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

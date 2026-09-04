// Metro configuration for a pnpm monorepo: watch the workspace root so the
// shared packages resolve, and allow symlinked node_modules.
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// No `unstable_enableSymlinks` or `disableHierarchicalLookup` here. Both were
// written for pnpm's isolated symlink layout; this workspace sets
// `node-linker=hoisted` (see .npmrc), so node_modules is a flat tree of real
// directories and Metro resolves it the ordinary way. Keeping them made
// `expo-doctor` flag the config as diverging from `expo/metro-config`, and
// `disableHierarchicalLookup` actively stops Metro walking up to the hoisted
// root — the one place most packages actually live here.

module.exports = config;

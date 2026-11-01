// No Apple Developer ID, so electron-builder's own signing is skipped. Apple
// Silicon refuses an unsigned .app ("damaged"), so ad-hoc sign it here instead.
// Runs per-arch after packing, before the dmg/zip are built, so the signature
// is baked into the distributed app.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`[after-pack] ad-hoc signed ${appPath}`);
};

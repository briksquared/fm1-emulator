# Enabling automated builds (CI)

The active workflow is `.github/workflows/release.yml`. It verifies the complete firmware catalog,
builds the Windows, macOS, and Linux installers, and attaches them to a GitHub Release whenever a
version tag is pushed.

Before cutting a release, run the same local gate:

```bash
npm ci
npm test
npm run dist:win
```

Then tag the already-tested commit, for example `git tag v1.1.0 && git push origin v1.1.0`.

GitHub Actions will build macOS (`.dmg`/`.zip`, Intel + Apple Silicon) and Linux
(`.AppImage`/`.deb`) and the Windows installer + portable, and attach them all to the release.

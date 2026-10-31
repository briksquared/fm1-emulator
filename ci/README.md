# Enabling automated builds (CI)

`ci/release.yml` is a ready-to-use GitHub Actions workflow that builds the Windows,
macOS, and Linux installers and attaches them to a GitHub Release whenever you push a
version tag (e.g. `v1.0.0`).

It lives here instead of `.github/workflows/` because activating a workflow requires the
`workflow` OAuth scope. To turn it on (one time):

```bash
gh auth refresh -h github.com -s workflow      # grant the workflow scope (opens browser)
git mv ci/release.yml .github/workflows/release.yml
git commit -m "ci: enable multi-OS release workflow"
git push
```

Or add it straight from github.com: **Actions → New workflow → set up a workflow yourself**,
paste the contents of `ci/release.yml`, and commit.

Then cut a release:

```bash
git tag v1.0.0 && git push --tags
```

GitHub Actions will build macOS (`.dmg`/`.zip`, Intel + Apple Silicon) and Linux
(`.AppImage`/`.deb`) and the Windows installer + portable, and attach them all to the release.

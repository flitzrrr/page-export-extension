# Release Guide

## Versioning

This extension is released from the repository, not npm. Keep these versions in sync:

- `extension/manifest.json` -> `version`
- `package.json` -> `version`

## Release steps

1. Update the version in `extension/manifest.json` and `package.json`.
2. Update `CHANGELOG.md` under the new version.
3. Run checks:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
4. Build the artifact:
   ```bash
   npm run package
   ```
5. Tag and push (optional):
   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```
6. Upload `dist/*.zip` to the Chrome Web Store or distribute internally.

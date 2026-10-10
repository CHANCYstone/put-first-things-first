# Developing Put First Things First

PFTF is an Obsidian community plugin written in TypeScript. The current user guide is in [README.md](README.md). The inherited Focus First guide and its former documentation workflow are preserved in [`legacy/`](legacy/) for reference; they describe the upstream plugin and are not release instructions for PFTF.

## Set up

Use the Node.js version in `.nvmrc` and install dependencies with `npm ci`. Run `npm run dev` for a watch build or `npm run build` for a production bundle. Put `main.js`, `manifest.json`, and `styles.css` in `<test-vault>/.obsidian/plugins/put-first-things-first/`, then reload Obsidian and enable the plugin. Test against a disposable vault, not a vault containing important notes.

## Verify changes

Run `npm run lint`, `npm test`, and `npm run build`. Check first install, task scanning, Focus ordering, daily planning, Daily Log generation, dark mode, narrow panes, and both desktop and mobile behavior. The test suite does not replace a real Obsidian check.

## Release

The version in `manifest.json` must match `package.json`, `package-lock.json`, and the entry in `versions.json`. Commit the source and manifest before creating a tag. The tag must match `manifest.version` exactly, with no `v` prefix. Attach `main.js`, `manifest.json`, and `styles.css` as separate assets to the GitHub Release. The default branch HEAD must contain the same manifest version. Follow the current [Obsidian submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) for the initial Community listing.

`release.sh --publish` is intended only for the maintainer's own repository. Review the remote, tag, and generated assets before using it.

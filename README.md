# CAITS

CAITS (Clean Architecture In TypeScript) is the technical base of a Marko project with a backend and a frontend: a container for the dependencies, the message buses, the stores of the frontend, a Vite plugin and the test helpers. Its package is [`caits`](https://www.npmjs.com/package/caits), on npm.

The documentation is on [caits.dev](https://caits.dev): start with [the docs](https://caits.dev/docs).

## Quick start

```sh
npx caits init my-app --example
cd my-app && npm run check
```

`init` makes the project, then installs its packages and the browser of the end-to-end tests. With `--example`, the project is a small app that shows each layer and each kind of test; without it, the project has one empty page.

## Requirements

- Node.js 22 (22.18 or later), 24, or 26 and later.
- git, for `init --example`: it gets the example with git.
- Linux, macOS or WSL 2. Native Windows is not supported: CAITS starts npm and npx without a shell, and stops the servers of the checks by their group of processes.

## Work on CAITS

- To check CAITS, run `npm run check`: types, lint, tests and coverage. `npm run test:mutation` runs the mutation tests.
- The example of `caits init --example` is not in this repository: it is in [IngeniozIT/caits-example](https://github.com/IngeniozIT/caits-example). `npm run test:template` takes it from the folder `../caits-example`: clone it there.
- [CHANGELOG.md](CHANGELOG.md) tells the changes of each version.

## Release a version

1. Give the version in `package.json` (`npm version <version> --no-git-tag-version`) and in the title of its part of [CHANGELOG.md](CHANGELOG.md), then commit.
2. Tag the same version in `caits-example`, and push the tag: CAITS `v0.5.0` writes the example of the tag `v0.5.0`.
3. Push the tag of CAITS (`git tag v0.5.0 && git push origin v0.5.0`). The workflow [Release](.github/workflows/release.yml) runs the checks, then stages the version on npm: npm trusts this workflow, so the repository keeps no token. The workflow skips a version that npm has already.
4. Make the version public, with the second factor of the npm account: `npm stage list caits`, then `npm stage approve <id>`.

## License

[0BSD](LICENSE): use, copy, change and share this code for any purpose, without asking, and without keeping this notice.

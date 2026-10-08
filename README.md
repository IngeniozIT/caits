# CAITS

CAITS (Clean Architecture In TypeScript) is the technical base of a Marko project with a backend and a frontend: a container for the dependencies, the message buses, the stores of the frontend, a Vite plugin and the test helpers. Its package is `@ingeniozit/caits`.

- To use CAITS in a project, read the [wiki](wiki/Home.md).
- To check CAITS, run `npm run check`: types, lint, tests and coverage. `npm run test:mutation` runs the mutation tests.
- The example of `caits init --example` is not in this repository: it is in [IngeniozIT/caits-example](https://github.com/IngeniozIT/caits-example). `npm run test:template` takes it from the folder `../caits-example`: clone it there.
- When you tag a version of CAITS, tag the same version in `caits-example`: CAITS `v0.4.0` writes the example of the tag `v0.4.0`.

# CAITS

CAITS (Clean Architecture In TypeScript) is the technical base of a Marko project with a backend and a frontend. Its package is `@ingeniozit/caits`. It gives:

- a container that gives each class its dependencies;
- a message bus for each context, and an event bus between the contexts;
- the stores of the frontend;
- a Vite plugin that finds the contexts of the project;
- a test helper for each type of test.

Your project holds the business code, in contexts. CAITS holds no business code.

## Pages

1. [Installation](Installation.md): make a new project with CAITS, add CAITS to a project, and update CAITS.
2. [Quality](Quality.md): change the rules and the settings of the tools of your project.

The next pages will tell how to add a context, a use case and a port.

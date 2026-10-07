# The kernel

`@ingeniozits/kernel` is the technical base of a Marko project with a backend and a frontend. It gives:

- a container that gives each class its dependencies;
- a message bus for each context, and an event bus between the contexts;
- the stores of the frontend;
- a Vite plugin that finds the contexts of the project;
- a test helper for each type of test.

Your project holds the business code, in contexts. The kernel holds no business code.

## Pages

1. [Installation](Installation.md): add the kernel to a new project.

The next pages will tell how to add a context, a use case and a port.

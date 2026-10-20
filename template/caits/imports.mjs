/**
 * The packages that each layer may import, as CAITS gives them. An entry is a package (`uuid`), a module (`@ingenioz-it/caits/Token`), a
 * Node API (`node:crypto`), or a folder of modules, ending with `/*` (`@ingenioz-it/caits/messaging/*`). A layer without a list imports
 * any package. The imports of the files of the project (`#context/…`, `./…`) are not packages: the other rules check them.
 * The domain holds the business rules: it imports only the primitives of the kernel. The application adds what a use case needs: its
 * handler publishes events. The presentation, the infra, di.ts and the context map have no list.
 * The project starts from these lists in its quality/imports.mjs.
 */
const domain = ["@ingenioz-it/caits/Result", "@ingenioz-it/caits/Token", "@ingenioz-it/caits/DomainEvent"];

export const allowed = {
  domain,
  application: [...domain, "@ingenioz-it/caits/messaging/EventPublisher"]
};

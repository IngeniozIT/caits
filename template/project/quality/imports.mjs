import { allowed } from "./caits/imports.mjs";

/**
 * The packages that each layer of this project may import, which `caits architecture` checks. They start from those of CAITS
 * (quality/caits/imports.mjs): the domain and the application import only the kernel's primitives, and the other layers any package.
 * Add a package to a list on purpose, for example:
 *   export default { ...allowed, domain: [...allowed.domain, "uuid"] };
 * The keys are domain, application, presentation, infra, di and contextMap. A layer without a list imports any package.
 */
export default allowed;

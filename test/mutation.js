// `npm run test:mutation`: the mutation tests of CAITS, as `caits mutation` runs those of a project, with the configuration of CAITS.
import { run } from "../quality/mutation.mjs";

process.exitCode = await run(process.argv.slice(2), "stryker.config.json");

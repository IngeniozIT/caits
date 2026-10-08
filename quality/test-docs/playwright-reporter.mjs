import { fromProjectRoot, saveRun, withoutColors, writeTestDocs } from "./test-docs.mjs";

const STATES = { expected: "passed", flaky: "passed", unexpected: "failed", skipped: "skipped" };

/** Keeps the tests of the Playwright run, then writes the test documentation page. */
export default class TestDocsReporter {
  printsToStdio() {
    return false;
  }

  onBegin(_config, suite) {
    this.suite = suite;
  }

  onEnd() {
    const tests = this.suite.allTests().map(test => {
      const error = test.results.at(-1)?.errors[0];
      return {
        file: fromProjectRoot(test.location.file),
        describes: describesOf(test),
        name: test.title,
        state: STATES[test.outcome()],
        ...(error ? { error: withoutColors(error.message ?? error.value ?? "") } : {})
      };
    });
    saveRun("e2e", tests);
    console.log(`Test documentation: ${fromProjectRoot(writeTestDocs())}`);
  }
}

function describesOf(test) {
  const names = [];
  for (let suite = test.parent; suite.type === "describe"; suite = suite.parent) names.unshift(suite.title);
  return names;
}

import { fromProjectRoot, saveRun, withoutColors, writeTestDocs } from "./test-docs.mjs";

/** @import { FullConfig, Reporter, Suite, TestCase } from "@playwright/test/reporter" */
/** @import { State } from "./test-docs.mjs" */

/** @type {Record<ReturnType<TestCase["outcome"]>, State>} */
const STATES = { expected: "passed", flaky: "passed", unexpected: "failed", skipped: "skipped" };

/**
 * Keeps the tests of the Playwright run, then writes the test documentation page.
 * @implements {Reporter}
 */
export default class TestDocsReporter {
  /** @type {Suite | undefined} */
  suite;

  printsToStdio() {
    return false;
  }

  /**
   * @param {FullConfig} _config
   * @param {Suite} suite
   */
  onBegin(_config, suite) {
    this.suite = suite;
  }

  onEnd() {
    const tests = (this.suite?.allTests() ?? []).map(test => {
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

/**
 * @param {TestCase} test
 * @returns {string[]}
 */
function describesOf(test) {
  const names = [];
  /** @type {Suite | undefined} */
  let suite = test.parent;
  for (; suite?.type === "describe"; suite = suite.parent) names.unshift(suite.title);
  return names;
}

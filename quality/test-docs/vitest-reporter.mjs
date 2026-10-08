import { fromProjectRoot, saveRun, withoutColors, writeTestDocs } from "./test-docs.mjs";

/** Keeps the tests of the Vitest run, then writes the test documentation page. */
export default class TestDocsReporter {
  onTestRunEnd(testModules) {
    const tests = testModules.flatMap(testModule => [...testModule.children.allTests()].map(testCase => {
      const result = testCase.result();
      const error = result.errors?.[0];
      return {
        file: fromProjectRoot(testModule.moduleId),
        describes: describesOf(testCase),
        name: testCase.name,
        state: result.state === "failed" ? "failed" : result.state === "passed" ? "passed" : "skipped",
        ...(error ? { error: withoutColors([error.message, error.diff].filter(Boolean).join("\n\n")) } : {})
      };
    }));
    saveRun("unit", tests);
    console.log(`Test documentation: ${fromProjectRoot(writeTestDocs())}`);
  }
}

function describesOf(testCase) {
  const names = [];
  for (let suite = testCase.parent; suite.type === "suite"; suite = suite.parent) names.unshift(suite.name);
  return names;
}

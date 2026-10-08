// `npm run test:template`: makes two projects with the CAITS of this folder, as a user does, one empty and one with the example, then
// runs all the checks of each. It installs the packages: it needs the network, or the npm cache. With --keep, the projects stay in the
// temporary folder.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const caits = join(import.meta.dirname, "..");
const folder = mkdtempSync(join(tmpdir(), "caits-template-"));
const projects = [{ name: "empty", options: [] }, { name: "example", options: ["--example"] }];

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  if (spawnSync(command, args, { cwd, stdio: "inherit" }).status !== 0) throw new Error(`failed: ${[command, ...args].join(" ")} (in ${cwd})`);
}

try {
  run("npm", ["pack", "--pack-destination", folder], caits);
  const tarball = join(folder, readdirSync(folder).find(name => name.endsWith(".tgz")) ?? "");
  for (const { name, options } of projects) {
    const app = join(folder, name);
    run("node", [join(caits, "bin/caits.js"), "init", app, "--caits", `file:${tarball}`, ...options], folder);
    run("npm", ["run", "quality"], app);
    run("npm", ["run", "test:mutation"], app);
  }
  console.log(`\nThe projects that CAITS makes pass all their checks.`);
} finally {
  if (process.argv.includes("--keep")) console.log(`The projects are in ${folder}`);
  else rmSync(folder, { recursive: true, force: true });
}

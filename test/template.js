// `npm run test:template`: makes two projects with the CAITS of this folder, as a user does, one empty and one with the example, then
// runs all the checks of each, and its development server. It installs the packages: it needs the network, or the npm cache. With
// --keep, the projects stay in the temporary folder.
// The example is the folder of its repository next to this one, ../caits-example, with its changes: clone IngeniozIT/caits-example there.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const caits = join(import.meta.dirname, "..");
const example = join(caits, "../caits-example");
if (!existsSync(example)) throw new Error(`the example is not in ${example}: clone git@github.com:IngeniozIT/caits-example.git there`);
const folder = mkdtempSync(join(tmpdir(), "caits-template-"));
const projects = [{ name: "empty", options: [] }, { name: "example", options: ["--example-source", example] }];

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 */
function run(command, args, cwd) {
  console.log(`\n> ${[command, ...args].join(" ")}`);
  if (spawnSync(command, args, { cwd, stdio: "inherit" }).status !== 0) throw new Error(`failed: ${[command, ...args].join(" ")} (in ${cwd})`);
}

/**
 * `npm run dev` keeps its pages after a build, which empties dist/, and after a change of the Vite configuration, which restarts Vite.
 * While the configuration has an error, the server keeps the configuration that it has.
 * The server uses ports of its own: the test runs also while the developer runs a server of their own.
 * @param {string} app
 */
async function checkDevServer(app) {
  console.log("\n> npm run dev: the pages after a build, after a change of the configuration, and while it has an error");
  const port = 4321;
  const page = `http://127.0.0.1:${port}/`;
  const server = spawn("npm", ["run", "dev"], { cwd: app, detached: true, env: { ...process.env, PORT: String(port), HMR_PORT: "24679" } });
  let output = "";
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { output += chunk; });
  /** @param {(output: string) => boolean} done @param {string} what */
  const waitFor = async (done, what) => {
    for (const end = Date.now() + 60_000; !done(output); await new Promise(resolve => setTimeout(resolve, 200))) {
      if (Date.now() > end) throw new Error(`the development server did not ${what}:\n${output}`);
    }
  };
  /** @param {string} step @param {string} [text] */
  const expectPage = async (step, text) => {
    for (const end = Date.now() + 30_000; ;) {
      const response = await fetch(page).catch(() => undefined);
      const body = await response?.text();
      if (response?.status === 200 && (!text || body?.includes(text))) return;
      if (Date.now() > end) throw new Error(`${step}: the development server answers ${response?.status ?? "nothing"} to ${page}\n${output}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  };
  const listenings = () => output.split("Server listening at").length - 1;
  try {
    await waitFor(() => listenings() === 1, "start");
    await expectPage("at the start");
    run("npm", ["run", "build"], app);
    // A change of a page makes the server read its files again: the page shows the change.
    appendFileSync(join(app, "src/routes/_frontend/+page.marko"), "\n<p>after the build</p>\n");
    await expectPage("after a build", "after the build");
    const configuration = join(app, "quality/vite.config.ts");
    const valid = readFileSync(configuration, "utf8");
    appendFileSync(configuration, "\n// changed\n");
    await waitFor(() => listenings() === 2 || output.includes("server restarted"), "restart");
    await expectPage("after a change of the configuration");
    appendFileSync(configuration, "\nexport const broken = ;\n");
    await waitFor(() => output.includes("does not load"), "refuse the configuration with an error");
    await expectPage("while the configuration has an error");
    writeFileSync(configuration, valid);
    await waitFor(() => listenings() === 3, "restart after the correction of the configuration");
    await expectPage("after the correction of the configuration");
    console.log("The development server keeps its pages.");
  } finally {
    // The server has a process group of its own (detached): npm, and the node of the server. Without a pid, the spawn failed. A server
    // that stopped already has no group: the kill fails, and the test shows the error of the check.
    try {
      if (server.pid) process.kill(-server.pid);
    } catch {
      // The server stopped already.
    }
  }
}

try {
  run("npm", ["pack", "--pack-destination", folder], caits);
  const tarball = join(folder, readdirSync(folder).find(name => name.endsWith(".tgz")) ?? "");
  for (const { name, options } of projects) {
    const app = join(folder, name);
    run("node", [join(caits, "bin/caits.js"), "init", app, "--caits", `file:${tarball}`, ...options], folder);
    run("npm", ["run", "quality"], app);
    run("npm", ["run", "test:mutation"], app);
    await checkDevServer(app);
  }
  console.log(`\nThe projects that CAITS makes pass all their checks.`);
} finally {
  if (process.argv.includes("--keep")) console.log(`The projects are in ${folder}`);
  else rmSync(folder, { recursive: true, force: true });
}

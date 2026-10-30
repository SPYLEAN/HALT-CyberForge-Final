#!/usr/bin/env node
// One entry point for running HALT locally without Docker (no extra task runner: plain Node, no dependencies).
//
//   npm run setup        create services/api/.venv (Python 3.12), install the API and the web workspace
//   npm run dev          API (SQLite file in .halt/, restart-safe) + Next dev server, hot reload
//   npm run demo         production build + API, reset to the seed, ready for a live demo
//                        (npm run demo -- --keep: restore where the last demo left off instead)
//   npm run demo:reset   reset the running demo to its seed (deterministic: same plan, proof, certificate)
//   npm run check        every static check, unit test and contract-drift check (no browser)
//   npm run test:e2e     Playwright + axe against a production build and a real API
//
// Environment: HALT_DB_URL overrides the SQLite file; HALT_API_ORIGIN (default http://localhost:8000) is
// where demo:reset sends its request. All data is synthetic (SIMULATED).
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "services", "api");
const STATE_DIR = join(ROOT, ".halt");
const WIN = process.platform === "win32";
const VENV_PYTHON = join(API_DIR, ".venv", WIN ? "Scripts/python.exe" : "bin/python");
const API_ORIGIN = process.env.HALT_API_ORIGIN ?? "http://localhost:8000";

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: WIN && !cmd.endsWith(".exe"), cwd: ROOT, ...opts });
  if (r.status !== 0) {
    console.error(`\n✗ failed: ${[cmd, ...args].join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function python() {
  if (!existsSync(VENV_PYTHON)) {
    console.error("No API virtualenv yet: run `npm run setup` first.");
    process.exit(1);
  }
  return VENV_PYTHON;
}

function apiEnv(name) {
  mkdirSync(STATE_DIR, { recursive: true });
  const db = join(STATE_DIR, `${name}.db`).replaceAll("\\", "/");
  return {
    ...process.env,
    HALT_DB_URL: process.env.HALT_DB_URL ?? `sqlite+pysqlite:///${db}`,
    HALT_SIGNING_KEY_PATH: process.env.HALT_SIGNING_KEY_PATH ?? join(STATE_DIR, "demo-signing-key.pem"),
    HALT_LOG_LEVEL: process.env.HALT_LOG_LEVEL ?? "INFO",
  };
}

/** Start long-running processes; Ctrl+C (or one of them exiting) stops all of them. */
function supervise(procs) {
  const children = procs.map(({ name, cmd, args, env, cwd }) => {
    const child = spawn(cmd, args, { cwd: cwd ?? ROOT, env: env ?? process.env, shell: WIN && !cmd.endsWith(".exe"), stdio: ["ignore", "pipe", "pipe"] });
    const prefix = `[${name}] `;
    for (const stream of [child.stdout, child.stderr]) {
      let rest = "";
      stream.on("data", (chunk) => {
        const lines = (rest + chunk).split(/\r?\n/);
        rest = lines.pop() ?? "";
        for (const line of lines) console.log(prefix + line);
      });
    }
    child.on("exit", (code) => {
      console.log(`${prefix}exited (${code})`);
      stop(code ?? 0);
    });
    return child;
  });
  let stopping = false;
  function stop(code) {
    if (stopping) return;
    stopping = true;
    for (const c of children) {
      if (c.exitCode === null) {
        if (WIN) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
        else c.kill("SIGTERM");
      }
    }
    process.exit(code);
  }
  process.on("SIGINT", () => stop(0));
  process.on("SIGTERM", () => stop(0));
  return children;
}

const apiProcess = (env, extra = []) => ({
  name: "api",
  cmd: python(),
  args: ["-m", "uvicorn", "halt.main:create_app", "--factory", "--app-dir", API_DIR, "--port", "8000", ...extra],
  env,
});

async function waitReady(timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < until) {
    try {
      const r = await fetch(`${API_ORIGIN}/api/v1/ready`);
      if (r.ok) return;
      last = JSON.stringify(await r.json());
    } catch (error) {
      last = String(error);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API not ready after ${timeoutMs / 1000} s: ${last}`);
}

async function resetToSeed() {
  const r = await fetch(`${API_ORIGIN}/api/v1/incidents/INC-2417/reset-to-seed`, { method: "POST" });
  const body = await r.json();
  if (!r.ok) throw new Error(`reset-to-seed failed (${r.status}): ${body.message ?? JSON.stringify(body)}`);
  console.log(`✓ INC-2417 reset to seed: state ${body.state}, variant ${body.variant}`);
}

const commands = {
  setup() {
    if (!existsSync(VENV_PYTHON)) {
      const [py, ...pyArgs] = WIN ? ["py", "-3.12"] : ["python3.12"];
      run(py, [...pyArgs, "-m", "venv", join(API_DIR, ".venv")]);
    }
    run(VENV_PYTHON, ["-m", "pip", "install", "--upgrade", "pip"]);
    run(VENV_PYTHON, ["-m", "pip", "install", "-e", ".[dev]"], { cwd: API_DIR });
    run("npm", ["install"]);
    console.log("\n✓ setup complete. Next: `npm run dev` or `npm run demo`.");
  },

  dev() {
    // A SQLite file, so an API restart (or --reload) restores the incident instead of starting over.
    supervise([apiProcess(apiEnv("halt-dev"), ["--reload", "--reload-dir", join(API_DIR, "halt")]), { name: "web", cmd: "npm", args: ["run", "dev", "-w", "@halt/web"] }]);
  },

  async demo() {
    run("npm", ["run", "build", "-w", "@halt/web"]);
    const [api] = supervise([apiProcess(apiEnv("halt-demo")), { name: "web", cmd: "npm", args: ["run", "start", "-w", "@halt/web", "--", "-p", "3000"] }]);
    try {
      await waitReady();
      if (process.argv.includes("--keep")) console.log("✓ --keep: INC-2417 restored from its journal, not reset");
      else await resetToSeed();
      console.log("\n✓ HALT demo ready: http://localhost:3000  (API http://localhost:8000/api/v1/docs). Ctrl+C stops it.");
      console.log("  Reset between runs: npm run demo:reset");
    } catch (error) {
      console.error(`✗ ${error.message}`);
      api.kill();
    }
  },

  async reset() {
    try {
      await resetToSeed();
    } catch (error) {
      console.error(`✗ ${error.message}\n  Is the API running? Start it with \`npm run demo\` or \`npm run dev\`.`);
      process.exit(1);
    }
  },

  check() {
    const py = python();
    run(py, ["-I", "scripts/verify_repo.py"]);
    run(py, ["-m", "ruff", "check", "."], { cwd: API_DIR });
    run(py, ["-m", "ruff", "format", "--check", "."], { cwd: API_DIR });
    run(py, ["-m", "mypy"], { cwd: API_DIR });
    run(py, ["-m", "pytest", "-p", "no:cacheprovider"], { cwd: API_DIR });
    run("npm", ["run", "lint"]);
    run("npm", ["run", "typecheck"]);
    run("npm", ["test"]);
    run("npm", ["run", "check:tokens", "-w", "@halt/web"]);
    // Contract drift: the regeneration commands from docs/HANDOFF.md must not change any generated file in the
    // working tree. (CI runs the same commands and compares against the commit with git diff.)
    const generated = [
      "services/api/openapi.json",
      "services/api/halt/scenario/inc_2417/background_events.json",
      "apps/web/src/lib/api/schema.d.ts",
      "apps/web/tests/fixtures/api/stages.json",
      "apps/web/tests/fixtures/api/ps2.json",
    ];
    const digest = (f) => createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex");
    const before = Object.fromEntries(generated.map((f) => [f, digest(f)]));
    run(py, ["-m", "halt.scenario.background"], { cwd: API_DIR });
    run(py, ["scripts/export_openapi.py"], { cwd: API_DIR });
    run(py, ["scripts/record_fixtures.py"], { cwd: API_DIR });
    run(py, ["scripts/record_ps2_fixtures.py"], { cwd: API_DIR });
    run("npm", ["run", "gen:api"]);
    const drifted = generated.filter((f) => digest(f) !== before[f]);
    if (drifted.length) {
      console.error(`
✗ contract drift: regenerating changed ${drifted.join(", ")}. Review and commit the regenerated files.`);
      process.exit(1);
    }
    console.log("\n✓ all checks passed (E2E not included: npm run test:e2e)");
  },
};

const name = process.argv[2];
if (!commands[name]) {
  console.error(`usage: node scripts/halt.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
await commands[name]();

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(workspaceRoot, "后端");
const frontendRoot = join(workspaceRoot, "智能体前端");
const agentRepoRoot = join(workspaceRoot, "电商设计图保持产品一致性智能体");
const agentRoot = join(agentRepoRoot, "agent");

function run(label, command, args, cwd) {
  process.stdout.write(`\n[release-gate] ${label}\n`);
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: exited with code ${result.status}`);
  }
}

function resolvePackageManager(name) {
  if (process.platform !== "win32") {
    return { command: name, argsPrefix: [] };
  }
  const candidates =
    name === "npm"
      ? [
          join(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js",
          ),
        ]
      : [
          join(
            process.env.APPDATA ?? "",
            "npm",
            "node_modules",
            "pnpm",
            "bin",
            "pnpm.mjs",
          ),
        ];
  const cli = candidates.find((candidate) => existsSync(candidate));
  if (!cli) {
    throw new Error(`Unable to locate the ${name} JavaScript CLI.`);
  }
  return { command: process.execPath, argsPrefix: [cli] };
}

function resolvePython() {
  const configured = process.env.AGENT_PYTHON?.trim();
  const candidates = [
    configured,
    process.platform === "win32"
      ? join(
          process.env.LOCALAPPDATA ?? "",
          "hermes",
          "hermes-agent",
          "venv",
          "Scripts",
          "python.exe",
        )
      : "",
    process.platform === "win32"
      ? join(agentRepoRoot, ".venv", "Scripts", "python.exe")
      : join(agentRepoRoot, ".venv", "bin", "python"),
  ].filter(Boolean);
  const local = candidates.find((candidate) => existsSync(candidate));
  if (local) return local;

  for (const candidate of process.platform === "win32"
    ? ["python.exe", "py.exe"]
    : ["python3", "python"]) {
    const probe = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error(
    "No Python runtime found. Set AGENT_PYTHON to the Agent virtualenv interpreter.",
  );
}

const npm = resolvePackageManager("npm");
const pnpm = resolvePackageManager("pnpm");
const python = resolvePython();
const pytestTemp = join(
  workspaceRoot,
  ".agent-runtime",
  `pytest-platform-release-${Date.now()}`,
);
const judgePolicyEvidence = join(
  workspaceRoot,
  ".agent-runtime",
  "judge-policy-regression.json",
);
const dryPipelineSmokeEvidence = join(
  workspaceRoot,
  ".agent-runtime",
  "e2e-pipeline-smoke-dry.json",
);

run(
  "Backend build, lint, Prisma and tests",
  npm.command,
  [...npm.argsPrefix, "run", "release:verify"],
  backendRoot,
);
run(
  "Backend production dependency audit",
  pnpm.command,
  [...pnpm.argsPrefix, "audit", "--prod", "--audit-level", "high"],
  backendRoot,
);
run(
  "E2E pipeline smoke (dry channels, no external publish)",
  process.execPath,
  [
    join(backendRoot, "scripts", "e2e-pipeline-smoke.mjs"),
    "--dry-channels",
    "--output",
    dryPipelineSmokeEvidence,
  ],
  backendRoot,
);
run(
  "Frontend lint and production build",
  npm.command,
  [...npm.argsPrefix, "run", "release:verify"],
  frontendRoot,
);
run(
  "Frontend production dependency audit",
  pnpm.command,
  [...pnpm.argsPrefix, "audit", "--prod", "--audit-level", "high"],
  frontendRoot,
);
run(
  "Agent six-family Judge policy regression",
  python,
  ["-m", "evals.judge_calibration", "--output", judgePolicyEvidence],
  agentRoot,
);
run(
  "Python Agent full regression",
  python,
  ["-m", "pytest", "-q", "-p", "no:cacheprovider", "--basetemp", pytestTemp],
  agentRoot,
);
run(
  "Agent repository whitespace check",
  "git",
  ["diff", "--check"],
  agentRepoRoot,
);

process.stdout.write(
  `${JSON.stringify(
    {
      status: "passed",
      gate: "platform-release",
      verifiedAt: new Date().toISOString(),
      components: [
        "backend",
        "e2e-pipeline-smoke-dry",
        "frontend",
        "python-agent",
      ],
      securityAuditLevel: "high",
    },
    null,
    2,
  )}\n`,
);

import { spawnSync } from "node:child_process";

const passthroughArgs = process.argv.slice(2);

function quoteWindowsArg(arg) {
  if (arg.length === 0) {
    return '""';
  }

  if (!/[\s"&|<>^]/.test(arg)) {
    return arg;
  }

  return `"${arg.replaceAll('"', '""')}"`;
}

function isCommandAvailable(command) {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec ?? "cmd.exe";
    const result = spawnSync(shell, ["/d", "/s", "/c", `where.exe ${command}`], {
      stdio: "ignore"
    });
    return result.status === 0;
  }

  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore"
  });
  return result.status === 0;
}

function runCommand(command, args) {
  if (process.platform === "win32") {
    const shell = process.env.ComSpec ?? "cmd.exe";
    const commandLine = [command, ...args].map(quoteWindowsArg).join(" ");
    return spawnSync(shell, ["/d", "/s", "/c", commandLine], {
      stdio: "inherit"
    });
  }

  return spawnSync(command, args, {
    stdio: "inherit"
  });
}

const commandCandidates = [
  { command: "pnpm", args: passthroughArgs },
  { command: "corepack", args: ["pnpm", ...passthroughArgs] }
];

for (const candidate of commandCandidates) {
  if (!isCommandAvailable(candidate.command)) {
    continue;
  }

  const result = runCommand(candidate.command, candidate.args);

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

console.error(
  [
    "Unable to find a pnpm runner.",
    "Install pnpm or make corepack available, then retry."
  ].join(" ")
);
process.exit(1);

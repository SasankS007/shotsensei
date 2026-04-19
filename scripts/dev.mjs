import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;

function run(name, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    for (const proc of children) {
      if (proc !== child && !proc.killed) {
        proc.kill("SIGTERM");
      }
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });

  children.push(child);
  return child;
}

run("backend", "python3", ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"], {
  cwd: new URL("../backend/", import.meta.url),
});
run("frontend", "npm", ["run", "dev:frontend"], {
  cwd: new URL("../", import.meta.url),
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    }
    process.exit(0);
  });
}

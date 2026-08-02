import { execFile, spawn } from "node:child_process";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { devNull } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SAFE_GIT_CONFIG = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  `core.hooksPath=${devNull}`,
  "-c",
  "protocol.ext.allow=never",
];

const REQUIRED_CONTROLS = [
  { path: "AGENTS.md", type: "file" },
  { path: "BLUEPRINT.md", type: "file" },
  { path: "CLAUDE.md", type: "file" },
  { path: "LEXICON.md", type: "file" },
  { path: "README.md", type: "file" },
  { path: "RUNBOOK.md", type: "file" },
  { path: "TASKBOARD.md", type: "file" },
  { path: "specs", type: "directory" },
];

const VALIDATION_CONTRACT = "audit-engine.json";
const MAX_VALIDATION_TIMEOUT_MS = 120_000;
const MAX_VALIDATION_OUTPUT_BYTES = 1_048_576;
const VALIDATION_KILL_GRACE_MS = 100;
const REMOTE_FETCH_FRESHNESS_MS = 48 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const FETCH_PROVENANCE_KEYS = [
  "fetchedAt",
  "remoteName",
  "remoteUrl",
  "schemaVersion",
  "sha",
  "trackedRef",
];
const GENERATED_ONLY_ACTIVITY_PATHS = new Set([
  "Projects/INDEX.md",
  "TASKBOARD.md",
]);
const SHELL_EXECUTABLES = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "dash",
  "fish",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "zsh",
]);

function safeGitEnvironment() {
  const environment = {};
  for (const name of [
    "PATH",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }

  return {
    ...environment,
    GIT_ALLOW_PROTOCOL: "file:https",
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_NO_LAZY_FETCH: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PROTOCOL_FROM_USER: "0",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
  };
}

function safeValidationEnvironment() {
  const environment = {};
  for (const name of [
    "PATH",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
  ]) {
    if (process.env[name]) environment[name] = process.env[name];
  }

  return {
    ...environment,
    CI: "1",
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
  };
}

function terminateValidationProcess(child, signal) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch {
      // Fall back to the direct child if the process group already disappeared.
    }
  }

  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

async function waitForValidationProcessGroupExit(pid) {
  if (process.platform === "win32" || !pid) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    return true;
  }

  return new Promise((resolve) => {
    const deadline = Date.now() + 1_000;
    const poll = () => {
      try {
        process.kill(-pid, 0);
      } catch (error) {
        if (error.code === "ESRCH") {
          resolve(true);
          return;
        }
      }

      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      setTimeout(poll, 10);
    };

    poll();
  });
}

function runValidationCommand({ argv, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      detached: process.platform !== "win32",
      env: safeValidationEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const output = { stdout: [], stderr: [] };
    let outputBytes = 0;
    let outputExceeded = false;
    let spawnError;
    let timedOut = false;
    let terminationSettled = false;
    let terminationVerified = false;
    let terminationFailure;
    let closeResult;
    let resolved = false;

    const resolveWhenTerminated = () => {
      if (resolved || !closeResult || (timedOut && !terminationSettled)) return;
      resolved = true;
      resolve({
        ...closeResult,
        terminationVerified: timedOut ? terminationVerified : null,
        terminationFailure,
      });
    };

    const collectResult = (code, signal) => ({
      code,
      signal,
      spawnError,
      timedOut,
      outputExceeded,
      stdout: Buffer.concat(output.stdout).toString("utf8"),
      stderr: Buffer.concat(output.stderr).toString("utf8"),
    });

    const capture = (stream) => (chunk) => {
      const buffer = Buffer.from(chunk);
      const remaining = Math.max(0, MAX_VALIDATION_OUTPUT_BYTES - outputBytes);
      if (remaining > 0) output[stream].push(buffer.subarray(0, remaining));
      outputBytes += buffer.length;
      if (outputBytes > MAX_VALIDATION_OUTPUT_BYTES && !outputExceeded) {
        outputExceeded = true;
        terminateValidationProcess(child, "SIGKILL");
      }
    };

    child.stdout.on("data", capture("stdout"));
    child.stderr.on("data", capture("stderr"));
    child.once("error", (error) => {
      spawnError = error;
    });

    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      terminateValidationProcess(child, "SIGTERM");
      setTimeout(async () => {
        terminateValidationProcess(child, "SIGKILL");
        terminationVerified = await waitForValidationProcessGroupExit(child.pid);
        if (!terminationVerified) {
          terminationFailure = "validation process group could not be confirmed terminated";
        }
        terminationSettled = true;
        closeResult ??= collectResult(null, null);
        resolveWhenTerminated();
      }, VALIDATION_KILL_GRACE_MS);
    }, timeoutMs);

    child.once("close", (code, signal) => {
      if (!timedOut) clearTimeout(deadlineTimer);
      closeResult = collectResult(code, signal);
      resolveWhenTerminated();
    });
  });
}

function escapeUntrustedLineSeparators(value) {
  return value
    .replaceAll("\u0085", "\\u0085")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function escapeChatLineSeparators(value) {
  return String(value).replaceAll(/[\n\r\u000b\u000c\u0085\u2028\u2029]/g, (separator) => {
    const codePoint = separator.codePointAt(0).toString(16).padStart(4, "0");
    return `\\u${codePoint}`;
  });
}

function quoteUntrustedDiagnostic(stderr, stdout) {
  const diagnostic = [stderr, stdout]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n")
    .replaceAll(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .trim()
    .slice(0, 2_000);

  return diagnostic
    ? `; untrusted output: ${JSON.stringify(escapeUntrustedLineSeparators(diagnostic))}`
    : "";
}

async function runGitAt(cwd, args) {
  const { stdout } = await execFileAsync("git", [...SAFE_GIT_CONFIG, ...args], {
    cwd,
    encoding: "utf8",
    env: safeGitEnvironment(),
    timeout: 10_000,
  });

  return stdout.trim();
}

async function runGit(projectPath, args) {
  return runGitAt(projectPath, args);
}

function safeRemoteUrl(remoteUrl) {
  if (isAbsolute(remoteUrl)) {
    return remoteUrl;
  }

  const httpsMatch = remoteUrl.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  );
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}/${httpsMatch[2]}.git`;
  }

  const sshMatch = remoteUrl.match(
    /^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/,
  );
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}/${sshMatch[2]}.git`;
  }

  throw new Error("Unsupported or unsafe remote URL; only absolute local paths and GitHub repositories are allowed.");
}

async function executionCapableFilters(projectPath) {
  const queryScope = async (scope) => {
    try {
      const output = await runGit(projectPath, [
        "config",
        scope,
        "--name-only",
        "--get-regexp",
        "^filter\\..*\\.(clean|smudge|process)$",
      ]);
      return output.split("\n").filter(Boolean);
    } catch (error) {
      if (error.code === 1) return [];
      throw error;
    }
  };

  let worktreeConfigEnabled = false;
  try {
    worktreeConfigEnabled =
      (await runGit(projectPath, [
        "config",
        "--local",
        "--bool",
        "--get",
        "extensions.worktreeConfig",
      ])) === "true";
  } catch (error) {
    if (error.code !== 1) throw error;
  }

  const configuredFilters = await Promise.all([
    queryScope("--local"),
    ...(worktreeConfigEnabled ? [queryScope("--worktree")] : []),
  ]);
  return [...new Set(configuredFilters.flat())];
}

function check(id, status, summary, evidence) {
  return { id, status, summary, evidence };
}

async function checkPath(projectPath) {
  try {
    const projectStat = await stat(projectPath);
    if (!projectStat.isDirectory()) {
      return check("path", "fail", "Project path is not a directory.", projectPath);
    }

    return check("path", "pass", "Project path exists.", projectPath);
  } catch (error) {
    return check("path", "fail", "Project path is unavailable.", error.message);
  }
}

async function checkRepository(projectPath) {
  try {
    const repositoryRoot = await runGit(projectPath, ["rev-parse", "--show-toplevel"]);
    const canonicalRoot = await realpath(repositoryRoot);

    if (canonicalRoot !== projectPath) {
      return check(
        "git-repository",
        "fail",
        "Project path is inside a repository but is not its root.",
        canonicalRoot,
      );
    }

    return check("git-repository", "pass", "Project path is a Git repository root.", canonicalRoot);
  } catch (error) {
    return check("git-repository", "fail", "Project path is not a readable Git repository.", error.message);
  }
}

async function checkHarness(projectPath) {
  const invalid = [];

  await Promise.all(
    REQUIRED_CONTROLS.map(async ({ path: relativePath, type }) => {
      try {
        const controlStat = await stat(join(projectPath, relativePath));
        const typeMatches = type === "file" ? controlStat.isFile() : controlStat.isDirectory();
        if (!typeMatches) {
          invalid.push(`${relativePath} (expected ${type})`);
        }
      } catch {
        invalid.push(`${relativePath} (missing ${type})`);
      }
    }),
  );

  if (invalid.length > 0) {
    invalid.sort();
    return check(
      "harness-controls",
      "fail",
      "Required Workbench controls are missing or have the wrong type.",
      invalid.join(", "),
    );
  }

  return check(
    "harness-controls",
    "pass",
    "Required Workbench controls are present.",
    REQUIRED_CONTROLS.map(({ path: relativePath }) => relativePath).join(", "),
  );
}

async function checkWorkingTree(projectPath) {
  try {
    const filters = await executionCapableFilters(projectPath);
    if (filters.length > 0) {
      return check(
        "working-tree",
        "fail",
        "Working-tree audit refused execution-capable filter configuration.",
        `Execution-capable filter configuration: ${filters.join(", ")}`,
      );
    }

    const status = await runGit(projectPath, ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status) {
      return check("working-tree", "fail", "Working tree has uncommitted changes.", status);
    }

    return check("working-tree", "pass", "Working tree is clean.", "git status --porcelain=v1");
  } catch (error) {
    return check("working-tree", "fail", "Working-tree state could not be read.", error.message);
  }
}

async function validateFetchProvenance(projectPath, provenance, now) {
  const invalid = (reason, status = "unverified") => ({
    ok: false,
    remoteFreshness: {
      status,
      fetchedAt: null,
      maxAgeHours: REMOTE_FETCH_FRESHNESS_MS / 3_600_000,
      evidence: reason,
    },
    reason,
  });

  if (!provenance) {
    return invalid("Trusted caller fetch provenance was not provided.", "unfetched");
  }
  if (
    typeof provenance !== "object"
    || Array.isArray(provenance)
    || Object.getPrototypeOf(provenance) !== Object.prototype
  ) {
    return invalid("Fetch provenance must be a plain JSON object.");
  }
  const keys = Object.keys(provenance).sort();
  if (
    keys.length !== FETCH_PROVENANCE_KEYS.length
    || keys.some((key, index) => key !== FETCH_PROVENANCE_KEYS[index])
  ) {
    return invalid("Fetch provenance must contain exactly the documented fields.");
  }
  if (
    provenance.schemaVersion !== "1.0"
    || typeof provenance.remoteName !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(provenance.remoteName)
    || typeof provenance.remoteUrl !== "string"
    || typeof provenance.trackedRef !== "string"
    || !/^refs\/remotes\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(provenance.trackedRef)
    || typeof provenance.sha !== "string"
    || !/^[0-9a-f]{40}$/.test(provenance.sha)
    || typeof provenance.fetchedAt !== "string"
  ) {
    return invalid("Fetch provenance field values are invalid.");
  }

  const fetchedAt = new Date(provenance.fetchedAt);
  if (
    Number.isNaN(fetchedAt.getTime())
    || fetchedAt.toISOString() !== provenance.fetchedAt
  ) {
    return invalid("Fetch provenance fetchedAt must be a canonical ISO timestamp.");
  }
  const ageMs = now.getTime() - fetchedAt.getTime();
  if (ageMs < 0 || ageMs > REMOTE_FETCH_FRESHNESS_MS) {
    return invalid("Trusted caller fetch provenance is stale.", "stale");
  }

  try {
    const branch = await runGit(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const trackedRef = await runGit(projectPath, [
      "rev-parse",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
    const remote = await runGit(projectPath, ["config", "--get", `branch.${branch}.remote`]);
    const mergeRef = await runGit(projectPath, ["config", "--get", `branch.${branch}.merge`]);
    const remoteUrl = await runGit(projectPath, ["config", "--get", `remote.${remote}.url`]);
    safeRemoteUrl(remoteUrl);
    const expectedTrackedRef = mergeRef.startsWith("refs/heads/")
      ? `refs/remotes/${remote}/${mergeRef.slice("refs/heads/".length)}`
      : null;
    const cachedUpstreamHead = await runGit(projectPath, ["rev-parse", trackedRef]);
    if (
      provenance.remoteName !== remote
      || provenance.remoteUrl !== remoteUrl
      || provenance.trackedRef !== trackedRef
      || trackedRef !== expectedTrackedRef
      || provenance.sha !== cachedUpstreamHead
    ) {
      return invalid("Fetch provenance does not exactly match the configured upstream.");
    }

    return {
      ok: true,
      trackedRef,
      sha: cachedUpstreamHead,
      remoteFreshness: {
        status: "fresh",
        fetchedAt: provenance.fetchedAt,
        maxAgeHours: REMOTE_FETCH_FRESHNESS_MS / 3_600_000,
        evidence: `Trusted caller provenance binds ${remote} ${trackedRef} at ${cachedUpstreamHead}.`,
      },
    };
  } catch (error) {
    return invalid(`Configured upstream could not be bound to trusted fetch provenance: ${error.message}`);
  }
}

async function checkUpstreamSync(projectPath, provenanceValidation) {
  if (!provenanceValidation.ok) {
    return check(
      "upstream-sync",
      "fail",
      "Upstream synchronization is not verified by trusted caller provenance.",
      provenanceValidation.reason,
    );
  }

  try {
    const counts = await runGit(projectPath, [
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...${provenanceValidation.trackedRef}`,
    ]);
    const [ahead, behind] = counts.split(/\s+/).map(Number);

    if (ahead !== 0 || behind !== 0) {
      return check(
        "upstream-sync",
        "fail",
        "Local branch and upstream are not synchronized.",
        `${provenanceValidation.trackedRef}: ahead ${ahead}, behind ${behind}`,
      );
    }

    return check(
      "upstream-sync",
      "pass",
      "Local branch matches the trusted freshly fetched tracking ref.",
      `${provenanceValidation.trackedRef}: caller fetch verified, ahead 0, behind 0`,
    );
  } catch (error) {
    return check("upstream-sync", "fail", "Local upstream synchronization could not be verified.", error.message);
  }
}

async function checkWorktrees(projectPath) {
  try {
    const output = await runGit(projectPath, ["worktree", "list", "--porcelain"]);
    const worktreeBlocks = output.split("\n\n").filter(Boolean);
    const worktreePaths = worktreeBlocks
      .map((block) => block.split("\n").find((line) => line.startsWith("worktree ")))
      .filter(Boolean)
      .map((line) => line.slice("worktree ".length));
    const unsafeMarkers = output
      .split("\n")
      .filter((line) => line === "locked" || line.startsWith("locked ") || line === "prunable" || line.startsWith("prunable "));

    if (unsafeMarkers.length > 0) {
      return check(
        "worktrees",
        "fail",
        "Registered worktrees include locked or prunable entries.",
        unsafeMarkers.join(", "),
      );
    }

    const dirtyWorktrees = [];
    await Promise.all(
      worktreePaths.map(async (worktreePath) => {
        try {
          const filters = await executionCapableFilters(worktreePath);
          if (filters.length > 0) {
            dirtyWorktrees.push(`${worktreePath} (execution-capable filter configuration)`);
            return;
          }
          const status = await runGit(worktreePath, [
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
          ]);
          if (status) {
            dirtyWorktrees.push(worktreePath);
          }
        } catch {
          dirtyWorktrees.push(`${worktreePath} (unreadable)`);
        }
      }),
    );

    if (dirtyWorktrees.length > 0) {
      dirtyWorktrees.sort();
      return check(
        "worktrees",
        "fail",
        "Registered worktrees include uncommitted or unreadable work.",
        dirtyWorktrees.join(", "),
      );
    }

    return check(
      "worktrees",
      "pass",
      "Registered worktrees are readable, clean, and have no unsafe markers.",
      `${worktreePaths.length} registered worktree(s)`,
    );
  } catch (error) {
    return check("worktrees", "fail", "Registered worktrees could not be inspected.", error.message);
  }
}

function parseValidationContract(source) {
  const contract = JSON.parse(source);
  if (contract?.schemaVersion !== "1.0" || !Array.isArray(contract.validation) || contract.validation.length === 0) {
    throw new Error("Expected schemaVersion 1.0 and a non-empty validation array.");
  }

  return contract.validation.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`validation[${index}] must be an object.`);
    }
    if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(entry.id)) {
      throw new Error(`validation[${index}].id must be a safe non-empty identifier.`);
    }
    if (
      !Array.isArray(entry.argv)
      || entry.argv.length === 0
      || entry.argv.some((value) => typeof value !== "string" || value.includes("\0"))
      || !entry.argv[0]
    ) {
      throw new Error(`validation[${index}].argv must be a non-empty array of strings.`);
    }
    if (SHELL_EXECUTABLES.has(basename(entry.argv[0]).toLowerCase())) {
      throw new Error(`validation[${index}].argv shell executables are not allowed.`);
    }
    if (
      !Number.isInteger(entry.timeoutMs)
      || entry.timeoutMs < 1
      || entry.timeoutMs > MAX_VALIDATION_TIMEOUT_MS
    ) {
      throw new Error(
        `validation[${index}].timeoutMs must be an integer from 1 to ${MAX_VALIDATION_TIMEOUT_MS}.`,
      );
    }

    return entry;
  });
}

async function checkProjectValidation(projectPath) {
  let entries;
  try {
    const source = await readFile(join(projectPath, VALIDATION_CONTRACT), "utf8");
    entries = parseValidationContract(source);
  } catch (error) {
    if (error.code === "ENOENT") {
      return check(
        "project-validation",
        "not-run",
        "Project validation contract is not declared.",
        `${VALIDATION_CONTRACT} is missing; no validation command was guessed.`,
      );
    }
    return check(
      "project-validation",
      "fail",
      "Project validation contract is invalid.",
      error.message,
    );
  }

  const evidence = [];
  let validationFailed = false;
  for (const { id, argv, timeoutMs } of entries) {
    const startedAt = Date.now();
    const result = await runValidationCommand({ argv, cwd: projectPath, timeoutMs });
    if (result.terminationFailure) {
      validationFailed = true;
      evidence.push(`${id}: infrastructure failure after timeout (${result.terminationFailure})`);
    } else if (result.timedOut) {
      validationFailed = true;
      evidence.push(`${id}: timed out after ${timeoutMs}ms`);
    } else if (result.outputExceeded) {
      validationFailed = true;
      evidence.push(`${id}: failed (output exceeded ${MAX_VALIDATION_OUTPUT_BYTES} bytes)`);
    } else if (result.spawnError) {
      validationFailed = true;
      const exit = result.spawnError.code ?? "unknown error";
      evidence.push(`${id}: failed (${exit})`);
    } else if (result.code === 0) {
      evidence.push(`${id}: passed (${Date.now() - startedAt}ms)`);
    } else {
      validationFailed = true;
      const exit = Number.isInteger(result.code)
        ? `exit ${result.code}`
        : result.signal
          ? `signal ${result.signal}`
          : "unknown error";
      evidence.push(
        `${id}: failed (${exit})${quoteUntrustedDiagnostic(result.stderr, result.stdout)}`,
      );
    }
  }

  return check(
    "project-validation",
    validationFailed ? "fail" : "pass",
    validationFailed
      ? "One or more project-owned validation commands failed."
      : "Project-owned validation passed.",
    evidence.join("; "),
  );
}

function unknownActivity(reason, overrides = {}) {
  return {
    lastRemoteCommit: null,
    remoteFreshness: {
      status: "unfetched",
      fetchedAt: null,
      maxAgeHours: REMOTE_FETCH_FRESHNESS_MS / 3_600_000,
      evidence: reason,
    },
    owningSpecIds: [],
    meaningfulProgress: "unknown",
    lastMeaningfulProgress: null,
    rejectedCheckpoints: [],
    daysWithoutMeaningfulProgress: null,
    ownerInputRequired: null,
    readyToArchive: null,
    reasons: [reason],
    ...overrides,
  };
}

async function readCurrentSpecEvidence(projectPath) {
  const specsPath = join(projectPath, "specs");
  const entries = await readdir(specsPath, { withFileTypes: true });
  const currentSpecs = [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const specPath = join(specsPath, entry.name, "SPEC.md");
    let source;
    try {
      source = await readFile(specPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    const status = source.match(/^\*\*Status:\*\*\s*(\S+)\s*$/m)?.[1]?.toLowerCase();
    if (status !== "active") continue;

    const specId = source.match(/^\*\*Spec ID:\*\*\s*(S-\d+)\s*$/m)?.[1] ?? entry.name;
    const evidenceHeading = /^## Append-Only Evidence(?: And Execution Log)?\s*$/m.exec(source);
    const evidenceStart = evidenceHeading
      ? evidenceHeading.index + evidenceHeading[0].length
      : -1;
    const nextHeading = evidenceStart >= 0
      ? source.slice(evidenceStart).search(/^##\s+/m)
      : -1;
    const evidence = evidenceStart < 0
      ? ""
      : source.slice(
          evidenceStart,
          nextHeading < 0 ? source.length : evidenceStart + nextHeading,
        );
    const pushedShas = new Set(
      [...evidence.matchAll(/\b[0-9a-f]{40}\b/gi)].map(([sha]) => sha.toLowerCase()),
    );
    currentSpecs.push({ id: specId, pushedShas });
  }

  return currentSpecs;
}

async function evaluateProjectActivity(projectPath, now, provenanceValidation) {
  let lastRemoteCommit;
  let commits;
  try {
    const history = await runGit(projectPath, [
      "log",
      "--reverse",
      "--format=%H%x09%cI",
      provenanceValidation.trackedRef,
    ]);
    commits = history
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, committedAt] = line.split("\t");
        return { sha, committedAt };
      });
    lastRemoteCommit = commits.at(-1) ?? null;
    if (!lastRemoteCommit) {
      return unknownActivity("The remote-tracking ref has no readable commits.");
    }
  } catch (error) {
    return unknownActivity(`Remote-tracking history is unavailable: ${error.message}`);
  }

  const remoteFreshness = provenanceValidation.remoteFreshness;

  let currentSpecs;
  try {
    currentSpecs = await readCurrentSpecEvidence(projectPath);
  } catch (error) {
    return unknownActivity(`Current stable-spec evidence is unreadable: ${error.message}`, {
      lastRemoteCommit,
      remoteFreshness,
    });
  }

  const owningSpecIds = currentSpecs.map(({ id }) => id);
  if (currentSpecs.length === 0) {
    return unknownActivity(
      "No active stable spec owns current activity evidence; inactivity was not inferred.",
      { lastRemoteCommit, remoteFreshness, owningSpecIds },
    );
  }

  const evidenceShas = new Set(
    currentSpecs.flatMap(({ pushedShas }) => [...pushedShas]),
  );
  const namedCheckpoints = commits.filter(({ sha }) => evidenceShas.has(sha.toLowerCase()));
  const meaningfulCheckpoints = [];
  const rejectedCheckpoints = [];
  for (const checkpoint of namedCheckpoints) {
    let changedPaths;
    try {
      changedPaths = (await runGit(projectPath, [
        "diff-tree",
        "--root",
        "--no-commit-id",
        "--name-only",
        "-r",
        checkpoint.sha,
      ])).split("\n").filter(Boolean);
    } catch (error) {
      return unknownActivity(`Named checkpoint paths are unreadable: ${error.message}`, {
        lastRemoteCommit,
        remoteFreshness,
        owningSpecIds,
      });
    }
    if (
      changedPaths.length === 0
      || changedPaths.every((path) => GENERATED_ONLY_ACTIVITY_PATHS.has(path))
    ) {
      rejectedCheckpoints.push({
        sha: checkpoint.sha,
        changedPaths,
        reason: changedPaths.length === 0
          ? "Checkpoint has no inspectable changed paths."
          : "Checkpoint changes generated projection files only.",
      });
    } else {
      meaningfulCheckpoints.push(checkpoint);
    }
  }
  const lastMeaningfulProgress = meaningfulCheckpoints.at(-1) ?? null;
  const activityAnchor = lastMeaningfulProgress ?? commits[0];
  const activityAnchorTime = new Date(activityAnchor.committedAt);
  if (Number.isNaN(activityAnchorTime.getTime()) || activityAnchorTime > now) {
    return unknownActivity("The activity clock or commit timestamp is invalid; inactivity was not inferred.", {
      lastRemoteCommit,
      remoteFreshness,
      owningSpecIds,
      rejectedCheckpoints,
    });
  }

  const daysWithoutMeaningfulProgress = Math.floor(
    (now.getTime() - activityAnchorTime.getTime()) / DAY_MS,
  );
  const ownerInputRequired = daysWithoutMeaningfulProgress >= 7;
  const readyToArchive = daysWithoutMeaningfulProgress >= 14;
  const meaningfulProgress = lastMeaningfulProgress ? "yes" : "no";
  const reasons = lastMeaningfulProgress
    ? [`Latest evidence-backed pushed progress is ${lastMeaningfulProgress.sha}.`]
    : ["No full pushed commit SHA appears in the append-only evidence of an active stable spec."];

  return {
    lastRemoteCommit,
    remoteFreshness,
    owningSpecIds,
    meaningfulProgress,
    lastMeaningfulProgress,
    rejectedCheckpoints,
    daysWithoutMeaningfulProgress,
    ownerInputRequired,
    readyToArchive,
    reasons,
  };
}

function formatChatReport(report) {
  const checkLines = report.checks.flatMap(({ id, status, summary, evidence }) => [
    `- ${id} (${status.toUpperCase()}): ${summary}`,
    `  Evidence: ${escapeChatLineSeparators(evidence)}`,
  ]);
  const archiveReasons = report.archiveReadiness.reasons.map((reason) => `- ${reason}`);
  const activity = report.activity;
  const activityLines = [
    `Remote freshness: ${activity.remoteFreshness.status.toUpperCase()}`,
    `Last remote commit: ${activity.lastRemoteCommit ? `${activity.lastRemoteCommit.sha} at ${activity.lastRemoteCommit.committedAt}` : "UNKNOWN"}`,
    `Meaningful progress: ${activity.meaningfulProgress.toUpperCase()}`,
    `Owner input required: ${activity.ownerInputRequired === null ? "UNKNOWN" : activity.ownerInputRequired ? "YES" : "NO"}`,
    `Ready to archive: ${activity.readyToArchive === null ? "UNKNOWN" : activity.readyToArchive ? "YES" : "NO"}`,
  ];

  return [
    `# Project audit: ${escapeChatLineSeparators(report.project.name)}`,
    "",
    `Audit status: ${report.status.toUpperCase()}`,
    ...checkLines,
    "",
    ...activityLines,
    "",
    `Archive readiness: ${report.archiveReadiness.status.replaceAll("-", " ")}`,
    ...archiveReasons,
    `Next action: ${report.nextAction}`,
  ].join("\n");
}

export async function runAuditRequest({
  projectPath,
  fetchProvenance,
  clock = () => new Date(),
}) {
  const generatedAt = new Date(clock());
  if (Number.isNaN(generatedAt.getTime())) {
    throw new Error("The injected audit clock must return a valid date.");
  }
  const requestedPath = typeof projectPath === "string" && projectPath.trim() ? projectPath : null;
  const canonicalPath = requestedPath
    ? await realpath(requestedPath).catch(() => requestedPath)
    : null;
  const checks = [];
  let provenanceValidation = null;
  let upstreamSyncCheck = null;

  const pathCheck = await checkPath(canonicalPath);
  checks.push(pathCheck);

  if (pathCheck.status === "pass") {
    const repositoryCheck = await checkRepository(canonicalPath);
    checks.push(repositoryCheck);

    if (repositoryCheck.status === "pass") {
      provenanceValidation = await validateFetchProvenance(
        canonicalPath,
        fetchProvenance,
        generatedAt,
      );
      upstreamSyncCheck = await checkUpstreamSync(canonicalPath, provenanceValidation);
      const genericChecks = [
        await checkHarness(canonicalPath),
        await checkWorkingTree(canonicalPath),
        upstreamSyncCheck,
        await checkWorktrees(canonicalPath),
      ];
      checks.push(...genericChecks);
      checks.push(
        genericChecks.some(({ status }) => status === "fail")
          ? check(
              "project-validation",
              "not-run",
              "Project validation was deferred.",
              "Validation was deferred until generic read-only checks pass.",
            )
          : await checkProjectValidation(canonicalPath),
      );
    }
  }

  const failures = checks.filter(({ status }) => status === "fail").length;
  const pending = checks.filter(({ status }) => status === "not-run").length;
  const passed = checks.filter(({ status }) => status === "pass").length;
  const identityVerified = checks
    .filter(({ id }) => id === "path" || id === "git-repository")
    .every(({ status }) => status === "pass");
  const failedChecks = checks.filter(({ status }) => status === "fail");
  const validationCheck = checks.find(({ id }) => id === "project-validation");
  const repositoryCheck = checks.find(({ id }) => id === "git-repository");
  const activity = repositoryCheck?.status !== "pass"
    ? unknownActivity("Project identity is unverified; activity was not evaluated.")
    : upstreamSyncCheck?.status !== "pass" || !provenanceValidation?.ok
      ? unknownActivity(
          "Upstream synchronization is unverified; activity was not evaluated.",
          provenanceValidation?.remoteFreshness
            ? { remoteFreshness: provenanceValidation.remoteFreshness }
            : {},
        )
      : await evaluateProjectActivity(canonicalPath, generatedAt, provenanceValidation);
  const archiveReadiness =
    failedChecks.length > 0
      ? {
          status: "blocked",
          reasons: failedChecks.map(({ summary }) => summary),
        }
      : validationCheck?.status !== "pass"
        ? {
            status: "not-evaluated",
            reasons: ["Project-specific validation commands have not been run."],
          }
        : activity.readyToArchive === null
          ? {
              status: "not-evaluated",
              reasons: activity.reasons,
            }
          : activity.readyToArchive
            ? {
                status: "ready-to-archive",
                reasons: [
                  `${activity.daysWithoutMeaningfulProgress} days have elapsed without evidence-backed pushed progress.`,
                  "Owner review is required; Audit Engine never archives a project.",
                ],
              }
            : {
                status: "not-ready",
                reasons: [
                  `${activity.daysWithoutMeaningfulProgress} days have elapsed without evidence-backed pushed progress.`,
                ],
              };
  const report = {
    schemaVersion: "1.0",
    generatedAt: generatedAt.toISOString(),
    project: {
      name: canonicalPath ? basename(canonicalPath) : "Unknown project",
      path: canonicalPath,
    },
    status:
      !identityVerified ? "unverified" : failures === 0 && pending === 0 ? "healthy" : "attention",
    summary: {
      passed,
      failed: failures,
      pending,
    },
    checks,
    activity,
    archiveReadiness,
    nextAction:
      failedChecks.length > 0
        ? "Resolve the failed read-only checks before evaluating project validation or lifecycle state."
        : validationCheck?.status !== "pass"
          ? `Declare project-specific validation in ${VALIDATION_CONTRACT} before making a lifecycle decision.`
          : activity.readyToArchive === null
            ? "Refresh local remote-tracking evidence and provide an active stable spec before evaluating inactivity."
            : activity.readyToArchive
              ? "Ask the owner whether to keep the project active or archive it; do not archive automatically."
              : activity.ownerInputRequired
                ? "Owner input is required before scheduled project work continues."
                : "Continue active work; owner input is not required yet.",
  };

  return {
    report,
    message: formatChatReport(report),
  };
}

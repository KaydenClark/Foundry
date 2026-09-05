#!/usr/bin/env node

import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    shell: false,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) {
      return null;
    }
    const detail = result.error?.message ?? result.stderr?.trim() ?? `exit ${result.status}`;
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
  return result.stdout.trim();
}

function safeRecoveryBranch(branch) {
  return (
    typeof branch === "string" &&
    branch.startsWith("recovery/") &&
    !branch.includes("..") &&
    git(process.cwd(), ["check-ref-format", "--branch", branch], { allowFailure: true }) !== null
  );
}

function safeRemoteUrl(remote) {
  if (
    typeof remote === "string"
    && isAbsolute(remote)
    && !/[\0\n\r]/.test(remote)
  ) {
    return remote;
  }
  if (
    typeof remote === "string"
    && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)
  ) {
    return remote;
  }
  if (
    typeof remote === "string"
    && /^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)
  ) {
    return remote;
  }
  return null;
}

function inspectIdentity(repoPath) {
  const cwd = realpathSync(resolve(repoPath));
  const top = git(cwd, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (!top || realpathSync(resolve(top)) !== cwd) {
    return { cwd, blocked: "blocked_not_canonical_root" };
  }
  const origin = git(cwd, ["remote", "get-url", "origin"], { allowFailure: true });
  if (!origin) {
    return { cwd, blocked: "blocked_no_origin" };
  }
  const safeOrigin = safeRemoteUrl(origin);
  if (!safeOrigin) {
    return { cwd, blocked: "blocked_unsafe_origin" };
  }
  return { cwd, origin: safeOrigin };
}

export function preflightRepo(repoPath, options = {}) {
  const identity = inspectIdentity(repoPath);
  if (identity.blocked) {
    return { action: identity.blocked, repo: identity.cwd };
  }
  const { cwd, origin } = identity;
  const branch = git(cwd, ["branch", "--show-current"]);
  const upstream = git(
    cwd,
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"],
    { allowFailure: true }
  );
  const trackedRef = git(
    cwd,
    ["rev-parse", "--symbolic-full-name", "@{upstream}"],
    { allowFailure: true }
  );
  if (!branch || !upstream || !trackedRef) {
    return { action: "blocked_no_upstream", repo: cwd, origin, branch: branch || null };
  }
  const remoteName = git(
    cwd,
    ["config", "--get", `branch.${branch}.remote`],
    { allowFailure: true }
  );
  const mergeRef = git(
    cwd,
    ["config", "--get", `branch.${branch}.merge`],
    { allowFailure: true }
  );
  if (
    !remoteName
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remoteName)
    || !mergeRef
    || !mergeRef.startsWith("refs/heads/")
    || trackedRef !== `refs/remotes/${remoteName}/${mergeRef.slice("refs/heads/".length)}`
  ) {
    return { action: "blocked_ambiguous_upstream", repo: cwd, origin, branch };
  }
  const configuredRemoteUrl = git(
    cwd,
    ["remote", "get-url", remoteName],
    { allowFailure: true }
  );
  const remoteUrl = safeRemoteUrl(configuredRemoteUrl);
  if (!remoteUrl) {
    return { action: "blocked_unsafe_upstream", repo: cwd, origin, branch };
  }
  const fetched = git(
    cwd,
    ["fetch", "--prune", remoteName, `+${mergeRef}:${trackedRef}`],
    { allowFailure: true }
  );
  if (fetched === null) {
    return { action: "blocked_fetch_failed", repo: cwd, origin, branch };
  }
  const fetchedAt = new Date(options.clock ? options.clock() : new Date());
  if (Number.isNaN(fetchedAt.getTime())) {
    return { action: "blocked_invalid_fetch_clock", repo: cwd, origin, branch };
  }
  const fetchProvenance = {
    schemaVersion: "1.0",
    remoteName,
    remoteUrl,
    trackedRef,
    sha: git(cwd, ["rev-parse", trackedRef]),
    fetchedAt: fetchedAt.toISOString(),
  };

  const dirty = git(cwd, ["status", "--porcelain", "--untracked-files=all"]) !== "";
  const [ahead, behind] = git(cwd, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`])
    .split(/\s+/)
    .map(Number);
  const base = { repo: cwd, origin, branch, upstream, dirty, ahead, behind, fetchProvenance };

  if (dirty) {
    return { ...base, action: "isolated_worktree_required" };
  }
  if (ahead > 0 && behind > 0) {
    if (branch === "main" || branch === "master") {
      return { ...base, action: "blocked_protected_divergence" };
    }
    if (!options.ownershipProven) {
      return { ...base, action: "blocked_diverged" };
    }
    if (!safeRecoveryBranch(options.recoveryBranch)) {
      throw new Error("a valid recovery/* branch is required for proven diverged work");
    }
    git(cwd, ["push", "origin", `HEAD:refs/heads/${options.recoveryBranch}`]);
    const recoverySha = git(
      cwd,
      ["ls-remote", "origin", `refs/heads/${options.recoveryBranch}`]
    ).split(/\s+/)[0];
    if (recoverySha !== git(cwd, ["rev-parse", "HEAD"])) {
      throw new Error("recovery branch push could not be verified on the remote");
    }
    return { ...base, action: "recovery_published", recoveryBranch: options.recoveryBranch };
  }
  if (ahead > 0) {
    if (branch === "main" || branch === "master") {
      return { ...base, action: "blocked_protected_ahead" };
    }
    return { ...base, action: "checkpoint_push_required" };
  }
  if (behind > 0) {
    if (!options.applySafeUpdate) {
      return { ...base, action: "ff_only_update_available" };
    }
    git(cwd, ["merge", "--ff-only", upstream]);
    return { ...base, action: "ready", behind: 0, updated: true };
  }
  return { ...base, action: "ready" };
}

export function verifyCloseout(repoPath, remoteBranch, options = {}) {
  const identity = inspectIdentity(repoPath);
  if (identity.blocked) {
    throw new Error(identity.blocked);
  }
  const { cwd } = identity;
  if (git(cwd, ["check-ref-format", "--branch", remoteBranch], { allowFailure: true }) === null) {
    throw new Error("invalid remote branch");
  }
  if (git(cwd, ["status", "--porcelain", "--untracked-files=all"]) !== "") {
    throw new Error("touched worktree is not clean");
  }
  const localSha = git(cwd, ["rev-parse", "HEAD"]);
  const remoteLine = git(cwd, ["ls-remote", "origin", `refs/heads/${remoteBranch}`]);
  const remoteSha = remoteLine.split(/\s+/)[0];
  if (!remoteSha || remoteSha !== localSha) {
    throw new Error("reported closeout SHA is not present on the live remote branch");
  }
  const verifiedAt = new Date(options.clock ? options.clock() : new Date());
  if (Number.isNaN(verifiedAt.getTime())) {
    throw new Error("closeout verification clock is invalid");
  }
  return {
    ok: true,
    repo: cwd,
    branch: remoteBranch,
    sha: localSha,
    verifiedAt: verifiedAt.toISOString(),
  };
}

function main(argv) {
  const [command, repoPath, extra] = argv;
  if (command === "preflight" && repoPath) {
    const result = preflightRepo(repoPath, { applySafeUpdate: extra === "--apply-safe-update" });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "closeout" && repoPath && extra) {
    process.stdout.write(`${JSON.stringify(verifyCloseout(repoPath, extra), null, 2)}\n`);
    return;
  }
  throw new Error(
    "usage: captain-git-preflight.mjs preflight REPO [--apply-safe-update] | closeout REPO REMOTE_BRANCH"
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

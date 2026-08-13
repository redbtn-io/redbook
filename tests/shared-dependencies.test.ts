import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Plain .mjs helper shared with the CI script; no type declarations.
import {
  verifySharedDependencies,
  REQUIRED_SHARED_VERSIONS,
} from "../scripts/verify-shared-dependencies.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("shared dependency contract", () => {
  it("holds for the committed manifest and lockfile", async () => {
    const result = await verifySharedDependencies({ directory: root });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("pins each shared package to an exact version", () => {
    for (const version of Object.values(REQUIRED_SHARED_VERSIONS as Record<string, string>)) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("maps the @redbtn scope to the private registry without committing a credential", async () => {
    const npmrc = await readFile(path.join(root, ".npmrc"), "utf8");
    expect(npmrc).toContain("@redbtn:registry=https://registry.redbtn.io/");
    // The token is supplied at build time via a BuildKit secret, never committed.
    expect(npmrc).not.toMatch(/_authToken=\S/);
    expect(npmrc).not.toMatch(/_password=\S/);
  });
});

describe("CI workflow", () => {
  it("runs on the self-hosted fleet runners and retries a cold registry cache", async () => {
    const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
    expect(workflow).toContain("[self-hosted, linux]");
    // npm E401 on a self-hosted runner is usually a cold cache; one retry clears it.
    expect(workflow).toMatch(/npm ci .*\|\| npm ci /);
    expect(workflow).toContain("Revoke registry credentials");
  });
});

describe("deploy contract", () => {
  it("targets book.redbtn.io on the tracked production branch", async () => {
    const raw = await readFile(path.join(root, "deploy/redrun-app.json"), "utf8");
    const contract = JSON.parse(raw);
    expect(contract.name).toBe("redbook");
    expect(contract.git.repository).toBe("redbtn-io/redbook");
    expect(contract.git.branch).toBe("main");
    expect(contract.git.autoDeploy).toBe(true);
    expect(contract.appConfig.customDomains).toEqual(["book.redbtn.io"]);
    expect(contract.appConfig.port).toBe(3000);
  });

  it("does not commit any credential value", async () => {
    const raw = await readFile(path.join(root, "deploy/redrun-app.json"), "utf8");
    expect(raw).not.toMatch(/mongodb(\+srv)?:\/\//);
    // Env var NAMES are listed; values must live in the RedRun workspace.
    expect(JSON.parse(raw).runtime.environment).toContain("JWT_SECRET");
  });
});

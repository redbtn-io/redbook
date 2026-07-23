import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), "../.github/workflows/shared-dependency-contract.yml"),
  "utf8",
);

describe("shared dependency workflow registry authentication", () => {
  it("uses the token auth field for the registry token secret", () => {
    expect(workflow).toContain(
      "printf '//registry.redbtn.io/:_authToken=%s\\n' \"$REDBTN_NPM_TOKEN\"",
    );
    expect(workflow).not.toContain("//registry.redbtn.io/:_auth=");
  });

  it("keeps credentials in the temporary npm user config", () => {
    expect(workflow).toContain("NPM_CONFIG_USERCONFIG: ${{ runner.temp }}/redbtn-npmrc");
    expect(workflow).toContain("rm -f \"${NPM_CONFIG_USERCONFIG:-$RUNNER_TEMP/redbtn-npmrc}\"");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), "../.github/workflows/shared-dependency-contract.yml"),
  "utf8",
);

describe("shared dependency workflow registry authentication", () => {
  it("loads the registry credential from the NPMRC Actions secret", () => {
    expect(workflow).toContain("NPMRC: ${{ secrets.NPMRC }}");
    expect(workflow).toContain('printf \'%s\\n\' "$NPMRC" > "$NPM_CONFIG_USERCONFIG"');
    expect(workflow).toContain("npm whoami --registry https://registry.redbtn.io/");
    expect(workflow).not.toContain("REDBTN_NPM_TOKEN");
  });

  it("keeps credentials in the temporary npm user config", () => {
    expect(workflow).toContain("NPM_CONFIG_USERCONFIG: ${{ runner.temp }}/redbtn-npmrc");
    expect(workflow).toContain("rm -f \"${NPM_CONFIG_USERCONFIG:-$RUNNER_TEMP/redbtn-npmrc}\"");
  });
});

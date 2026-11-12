import { describe, expect, it } from "vitest";

import { loadRuntimeConfig, validateRuntimeConfig } from "../src/lib/config";

/**
 * The shared redOrg directory connection is a config value of its own.
 * It must be read from REDORG_MONGODB_URI, and a production deploy
 * without it must fail validation rather than silently point redOrg at
 * the app's own database, which is the silo bug this integration removed.
 */
describe("redorg directory config", () => {
  const base = {
    NODE_ENV: "development",
    MONGODB_URI: "mongodb://localhost:27017",
    JWT_SECRET: "secret-value",
  };

  it("reads REDORG_MONGODB_URI into the runtime config", () => {
    const config = loadRuntimeConfig({
      ...base,
      REDORG_MONGODB_URI: "mongodb://localhost:27017/redorg",
    });
    expect(config.redorgMongoUri).toBe("mongodb://localhost:27017/redorg");
  });

  it("defaults the directory URI to empty when unset", () => {
    const config = loadRuntimeConfig(base);
    expect(config.redorgMongoUri).toBe("");
  });

  it("requires the directory URI in production only", () => {
    const production = loadRuntimeConfig({
      ...base,
      NODE_ENV: "production",
      PUBLIC_URL: "https://book.redbtn.io",
    });
    expect(production.production).toBe(true);
    expect(validateRuntimeConfig(production)).toContain("REDORG_MONGODB_URI is required");

    const development = loadRuntimeConfig(base);
    expect(validateRuntimeConfig(development)).not.toContain("REDORG_MONGODB_URI is required");
  });

  it("accepts a production config that sets the directory URI", () => {
    const production = loadRuntimeConfig({
      ...base,
      NODE_ENV: "production",
      PUBLIC_URL: "https://book.redbtn.io",
      REDORG_MONGODB_URI: "mongodb://localhost:27017/redorg",
    });
    expect(validateRuntimeConfig(production)).toEqual([]);
  });
});

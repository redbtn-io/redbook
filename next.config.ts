import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (RedRun runs
  // `node server.js` out of .next/standalone).
  output: "standalone",
  // Pin the workspace root so a lockfile above the repo is never picked up.
  turbopack: {
    root: path.join(__dirname),
  },
  // mongodb and mongoose pull in optional native/dynamic requires that the
  // bundler cannot statically resolve. Keeping them external leaves them as
  // plain runtime requires against node_modules, which `output: standalone`
  // traces correctly.
  serverExternalPackages: ["mongodb", "mongoose", "@redbtn/redorg", "@redbtn/redauth"],
};

export default nextConfig;

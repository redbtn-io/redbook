/**
 * Test stub for the `server-only` package.
 *
 * The real package deliberately throws when it is resolved through a client
 * build, which is how it enforces the server boundary at bundle time. Vitest
 * runs in Node with no such graph, so importing a server module would trip
 * that guard for no reason. The boundary is still enforced where it matters:
 * `next build` resolves the real package.
 */
export {};

/**
 * The cookie that remembers which org a user was last working in. Kept in
 * its own module because both the server (org resolution) and the client
 * (the switcher) need the name, and neither should import the other's
 * world to get it.
 */
export const ORG_COOKIE = "redbook_org";

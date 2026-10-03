/**
 * The session cookie's name. Its own module, with no imports, so the edge
 * middleware can read it without pulling in Node crypto or the database.
 */
export const SESSION_COOKIE = "dentec_session";

const OWNER_HEADER = 'oai-authenticated-user-id';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Owner-only guard for data APIs.
 *
 * Hosted Sites are owner-private: the platform injects `oai-authenticated-user-id`
 * for every signed-in request and strips client-supplied copies of the header.
 * Local `start-workbench` runs on loopback without a sign-in round trip, so
 * loopback requests are trusted as the owner as well.
 */
export function isOwnerRequest(req: Request) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return false;
    const userId = req.headers.get(OWNER_HEADER)?.trim();
    if (userId) return userId.length <= 200;
    return LOOPBACK_HOSTS.has(url.hostname.replace(/^\[|\]$/g, '').toLowerCase());
}

// crypto.randomUUID() is gated behind a secure context (HTTPS, or
// http://localhost) per spec -- throws "crypto.randomUUID is not a
// function" when reached over plain HTTP via a bare IP (e.g. a Tailscale
// address during local dev), even though `crypto` itself still exists.
// crypto.getRandomValues() has no such restriction, so this falls back to
// building a UUID v4 from it by hand; this id is never used for anything
// security-sensitive, just a session identifier.
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// One session per page load, deliberately not persisted. Everything the
// visitor sees -- the message list, the to-do items -- starts over on a
// reload, so the backend's stored conversation has to start over with it.
// With a persisted id the model kept the whole history across reloads
// while the page did not: after the intro had replayed a few times it
// answered "remember to buy groceries" with "I've already added that
// several times" instead of adding it.
//
// No server is involved in session assignment here (unlike ssr-agent's
// cookie) -- the backend's /resolve just takes session_id as a plain
// field, so the client is free to mint its own.
export function createSessionId(): string {
  return randomId()
}

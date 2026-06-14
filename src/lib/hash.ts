/**
 * Lightweight content hashing for the quarantine integrity check.
 * Uses the Web Crypto SubtleCrypto API when available (secure contexts),
 * falling back to a fast non-cryptographic digest otherwise.
 */
export async function hashFile(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    if (globalThis.crypto?.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return (
        'sha256:' +
        Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
          .slice(0, 32)
      );
    }
    return 'fnv:' + fnv1a(new Uint8Array(buf));
  } catch {
    return 'fnv:' + fnv1a(new TextEncoder().encode(file.name + file.size));
  }
}

function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

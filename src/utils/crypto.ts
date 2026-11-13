// Real End-to-End Encryption (AES-256-GCM + PBKDF2-SHA256) using Web Crypto API

const PBKDF2_ITERATIONS = 100_000;

function getSubtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) {
    throw new Error('Web Crypto SubtleCrypto API is unavailable in this environment.');
  }
  return c.subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSaltBase64(length = 16): string {
  const salt = new Uint8Array(length);
  globalThis.crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export async function deriveVaultKey(
  passphrase: string,
  saltBase64: string,
): Promise<CryptoKey> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Passphrase must be at least 4 characters long.');
  }
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const saltBytes = base64ToBytes(saltBase64);
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function generateDeviceVaultKey(): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportKeyJwk(key: CryptoKey): Promise<JsonWebKey> {
  return getSubtle().exportKey('jwk', key);
}

export async function importKeyJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return getSubtle().importKey(
    'jwk',
    jwk,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function computeKeyFingerprint(key: CryptoKey): Promise<string> {
  const subtle = getSubtle();
  const raw = await subtle.exportKey('raw', key);
  const digest = new Uint8Array(await subtle.digest('SHA-256', raw));
  const hex = Array.from(digest.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export async function encryptText(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const subtle = getSubtle();
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoded,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptText(
  ciphertextBase64: string,
  ivBase64: string,
  key: CryptoKey,
): Promise<string> {
  const subtle = getSubtle();
  const cipherBytes = base64ToBytes(ciphertextBase64);
  const ivBytes = base64ToBytes(ivBase64);
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    key,
    cipherBytes as BufferSource,
  );
  return new TextDecoder().decode(decrypted);
}

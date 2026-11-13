import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeKeyFingerprint,
  decryptText,
  deriveVaultKey,
  encryptText,
  exportKeyJwk,
  generateDeviceVaultKey,
  generateSaltBase64,
  importKeyJwk,
} from './crypto';

test('AES-GCM encryptText and decryptText round-trip with PBKDF2 derived key', async () => {
  const salt = generateSaltBase64();
  const key = await deriveVaultKey('my-secure-passphrase', salt);
  const message = 'Private workspace context & secret API note 2026.';

  const { ciphertext, iv } = await encryptText(message, key);
  assert.notEqual(ciphertext, message);
  assert.ok(iv.length > 8);

  const decrypted = await decryptText(ciphertext, iv, key);
  assert.equal(decrypted, message);
});

test('decryption fails with wrong passphrase', async () => {
  const salt = generateSaltBase64();
  const key1 = await deriveVaultKey('passphrase-one', salt);
  const key2 = await deriveVaultKey('passphrase-two', salt);
  const { ciphertext, iv } = await encryptText('confidential', key1);

  await assert.rejects(async () => {
    await decryptText(ciphertext, iv, key2);
  });
});

test('device vault key JWK export/import preserves deterministic fingerprint', async () => {
  const key = await generateDeviceVaultKey();
  const fp1 = await computeKeyFingerprint(key);
  const jwk = await exportKeyJwk(key);
  const reimported = await importKeyJwk(jwk);
  const fp2 = await computeKeyFingerprint(reimported);

  assert.equal(fp1, fp2);
  assert.match(fp1, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

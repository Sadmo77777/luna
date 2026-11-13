import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryLruCache } from './cache';

test('MemoryLruCache evicts least recently used entry when full', () => {
  const cache = new MemoryLruCache<string>(2, 10_000);
  cache.set('a', '1');
  cache.set('b', '2');
  // Touch 'a' so 'b' becomes LRU
  assert.equal(cache.get('a'), '1');
  cache.set('c', '3');

  assert.equal(cache.get('a'), '1');
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('c'), '3');
});

test('MemoryLruCache expires entries past TTL', async () => {
  const cache = new MemoryLruCache<number>(5, 15);
  cache.set('k', 42, 10);
  assert.equal(cache.get('k'), 42);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(cache.get('k'), undefined);
});

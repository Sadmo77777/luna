import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkDocument, retrieveRelevantChunks, type ContextDocument } from './contextSearch';

test('chunkDocument splits large documents with overlap', () => {
  const longText = 'A'.repeat(2000);
  const doc: ContextDocument = {
    id: 'doc-1',
    title: 'Architecture Spec',
    docType: 'document',
    content: longText,
    updatedAt: 1000,
  };
  const chunks = chunkDocument(doc, 900, 100);
  assert.ok(chunks.length >= 3);
  assert.equal(chunks[0].text.length, 900);
});

test('retrieveRelevantChunks ranks matching codebase files highest', () => {
  const docs: ContextDocument[] = [
    {
      id: 'd1',
      title: 'README.md',
      docType: 'document',
      content: 'Welcome to the workspace guide for onboarding.',
      updatedAt: 100,
    },
    {
      id: 'd2',
      title: 'src/utils/crypto.ts',
      docType: 'codebase',
      content: 'Uses AES-GCM 256-bit encryption and PBKDF2 SHA-256 key derivation.',
      updatedAt: 200,
    },
  ];

  const hits = retrieveRelevantChunks('How does AES-GCM encryption work?', docs, 2);
  assert.equal(hits[0].docId, 'd2');
  assert.ok(hits[0].score > hits[1].score);
});

export interface ContextDocument {
  id: string;
  title: string;
  docType: 'document' | 'codebase' | 'note';
  language?: string;
  content: string;
  updatedAt: number;
}

export interface DocumentChunk {
  docId: string;
  title: string;
  docType: 'document' | 'codebase' | 'note';
  chunkIndex: number;
  text: string;
  score: number;
}

export function chunkDocument(
  doc: ContextDocument,
  maxChars = 900,
  overlap = 120,
): DocumentChunk[] {
  const text = doc.content.trim();
  if (!text) return [];
  if (text.length <= maxChars) {
    return [
      {
        docId: doc.id,
        title: doc.title,
        docType: doc.docType,
        chunkIndex: 0,
        text,
        score: 0,
      },
    ];
  }

  const chunks: DocumentChunk[] = [];
  let start = 0;
  let index = 0;
  const safeStep = Math.max(100, maxChars - overlap);

  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    chunks.push({
      docId: doc.id,
      title: doc.title,
      docType: doc.docType,
      chunkIndex: index,
      text: text.slice(start, end),
      score: 0,
    });
    if (end >= text.length) break;
    start += safeStep;
    index++;
  }
  return chunks;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

export function retrieveRelevantChunks(
  query: string,
  docs: ContextDocument[],
  topK = 4,
): DocumentChunk[] {
  if (!docs.length) return [];
  const queryTerms = Array.from(new Set(tokenize(query)));
  const allChunks: DocumentChunk[] = [];

  for (const doc of docs) {
    const chunks = chunkDocument(doc);
    for (const chunk of chunks) {
      const titleTokens = tokenize(doc.title);
      const bodyLower = chunk.text.toLowerCase();
      let score = 0;

      if (queryTerms.length === 0) {
        score = 1;
      } else {
        for (const term of queryTerms) {
          if (titleTokens.includes(term)) score += 3.5;
          let pos = bodyLower.indexOf(term);
          let hits = 0;
          while (pos !== -1 && hits < 8) {
            hits++;
            pos = bodyLower.indexOf(term, pos + term.length);
          }
          score += hits * 1.4;
        }
      }

      if (score > 0) {
        allChunks.push({ ...chunk, score });
      }
    }
  }

  allChunks.sort((a, b) => b.score - a.score);
  if (allChunks.length === 0 && docs.length > 0) {
    return docs.slice(0, topK).flatMap((d) => chunkDocument(d).slice(0, 1));
  }
  return allChunks.slice(0, topK);
}

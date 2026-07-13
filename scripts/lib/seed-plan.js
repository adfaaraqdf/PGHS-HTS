import { forceUpdateFor } from './seed-documents.js';

export function createSeedPlan(documents, existingPaths, { force = false } = {}) {
  const existing = new Set(existingPaths);
  const operations = [];
  const counts = { created: 0, skipped: 0, updated: 0, failed: 0 };

  for (const document of documents) {
    if (!existing.has(document.path)) {
      operations.push({ type: 'create', ...document });
      counts.created += 1;
      continue;
    }

    const update = force ? forceUpdateFor(document) : null;
    if (update) {
      operations.push({ type: 'update', ...document, data: update });
      counts.updated += 1;
    } else {
      counts.skipped += 1;
    }
  }

  return { operations, counts };
}

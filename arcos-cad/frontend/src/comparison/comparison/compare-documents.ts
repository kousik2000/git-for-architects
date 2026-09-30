import type { ArcosCadDocument } from '../../types/cad-json';
import type { ComparisonResult, ComparisonSpaceResult, ComparisonChange } from '../types/comparison-types';
import { normalizeDocument } from '../normalization/normalize-document';
import { matchEntities } from '../matching/entity-matcher';
import { compareEntities, createEntityReference } from './compare-entities';
import { TIMING } from '../performance/timingLogger';

export function compareCadDocuments(oldDocument: ArcosCadDocument, newDocument: ArcosCadDocument): ComparisonResult {
  TIMING.mark('T3');
  const oldNorm = normalizeDocument(oldDocument);
  TIMING.mark('T4');
  
  TIMING.mark('T5');
  const newNorm = normalizeDocument(newDocument);
  TIMING.mark('T6');
  
  TIMING.mark('T7');

  const spaces = new Set([...Object.keys(oldNorm), ...Object.keys(newNorm)]);
  const spaceResults: ComparisonSpaceResult[] = [];

  const overallSummary = {
    added: 0,
    removed: 0,
    modified: 0,
    unchanged: 0
  };

  for (const spaceKey of spaces) {
    const oldEntities = oldNorm[spaceKey] || [];
    const newEntities = newNorm[spaceKey] || [];

    const matchResult = matchEntities(oldEntities, newEntities);
    const changes: ComparisonChange[] = [];

    const summary = {
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0
    };

    // Process matched pairs
    for (const match of matchResult.matches) {
      const change = compareEntities(match.oldEntity, match.newEntity, match.matchMethod);
      changes.push(change);
      
      if (change.changeType === 'MODIFIED') {
        summary.modified++;
      } else {
        summary.unchanged++;
      }
    }

    // Process unmatched OLD as REMOVED
    for (const removed of matchResult.unmatchedOld) {
      changes.push({
        changeType: 'REMOVED',
        entityType: removed.entityType,
        oldEntity: createEntityReference(removed)
      });
      summary.removed++;
    }

    // Process unmatched NEW as ADDED
    for (const added of matchResult.unmatchedNew) {
      changes.push({
        changeType: 'ADDED',
        entityType: added.entityType,
        newEntity: createEntityReference(added)
      });
      summary.added++;
    }

    // Aggregate to overall
    overallSummary.added += summary.added;
    overallSummary.removed += summary.removed;
    overallSummary.modified += summary.modified;
    overallSummary.unchanged += summary.unchanged;

    // Aggregate stats (could also keep per-space stats if needed, but we'll put it on overall for now)
    if (!overallSummary.hasOwnProperty('stats')) {
      (overallSummary as any).stats = { ...matchResult.stats };
    } else {
      const s = (overallSummary as any).stats;
      const m = matchResult.stats;
      for (const k of Object.keys(m)) {
        (s as any)[k] += (m as any)[k];
      }
    }

    let layoutName: string | undefined;
    const sampleEntity = oldEntities[0] || newEntities[0];
    if (sampleEntity && sampleEntity.layoutName) {
      layoutName = sampleEntity.layoutName;
    }

    spaceResults.push({
      space: spaceKey,
      layoutName,
      summary,
      changes
    });
  }

  TIMING.mark('T8');
  TIMING.mark('T9');

  return {
    summary: overallSummary,
    spaces: spaceResults
  };
}

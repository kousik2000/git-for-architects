import type { NormalizedCadEntity, MatchMethod } from '../types/comparison-types';
import { isGeometryEqual } from '../geometry/geometry-equality';

export interface MatchedPair {
  oldEntity: NormalizedCadEntity;
  newEntity: NormalizedCadEntity;
  matchMethod: MatchMethod;
}

export interface MatchResult {
  matches: MatchedPair[];
  unmatchedOld: NormalizedCadEntity[];
  unmatchedNew: NormalizedCadEntity[];
  stats: {
    stage1Candidates: number;
    stage1Matched: number;
    stage1Comparisons: number;
    stage2Candidates: number;
    stage2Matched: number;
    stage2Comparisons: number;
    stage3Candidates: number;
    stage3Matched: number;
    stage3Comparisons: number;
  };
}

export function matchEntities(
  oldEntities: NormalizedCadEntity[],
  newEntities: NormalizedCadEntity[]
): MatchResult {
  const matches: MatchedPair[] = [];
  const stats = {
    stage1Candidates: oldEntities.length + newEntities.length,
    stage1Matched: 0,
    stage1Comparisons: 0, // Hash lookups don't really count as geometric comparisons
    stage2Candidates: 0,
    stage2Matched: 0,
    stage2Comparisons: 0,
    stage3Candidates: 0,
    stage3Matched: 0,
    stage3Comparisons: 0
  };
  
  const oldPool = new Set(oldEntities);
  const newPool = new Set(newEntities);

  // Helper to remove matched candidates
  const pairUp = (oldE: NormalizedCadEntity, newE: NormalizedCadEntity, method: MatchMethod) => {
    matches.push({ oldEntity: oldE, newEntity: newE, matchMethod: method });
    oldPool.delete(oldE);
    newPool.delete(newE);
  };

  // ---------------------------------------------------------
  // STAGE 1: Exact Signature Match
  // Groups by matchingSignature (which includes geometry, type, context but NOT layer/style)
  // ---------------------------------------------------------
  const oldBySig = new Map<string, NormalizedCadEntity[]>();
  for (const old of oldPool) {
    if (!oldBySig.has(old.matchingSignature)) {
      oldBySig.set(old.matchingSignature, []);
    }
    oldBySig.get(old.matchingSignature)!.push(old);
  }

  for (const newE of Array.from(newPool)) {
    const candidates = oldBySig.get(newE.matchingSignature);
    if (candidates && candidates.length > 0) {
      // Find the first available candidate in the pool
      const matchedIdx = candidates.findIndex(c => oldPool.has(c));
      if (matchedIdx !== -1) {
        const matchedOld = candidates[matchedIdx];
        pairUp(matchedOld, newE, 'EXACT_SIGNATURE');
        candidates.splice(matchedIdx, 1);
        stats.stage1Matched++;
      }
    }
    stats.stage1Comparisons++;
  }

  // ---------------------------------------------------------
  // Helper for bucketing remaining candidates
  // ---------------------------------------------------------
  const getContextKey = (e: NormalizedCadEntity) => {
    return `${e.entityType}|${e.space}|${e.layoutName || ''}|${e.insertPath.join('>')}`;
  };

  stats.stage2Candidates = oldPool.size + newPool.size;

  if (stats.stage2Candidates > 0) {
    const oldByContext = new Map<string, NormalizedCadEntity[]>();
    for (const old of oldPool) {
      const key = getContextKey(old);
      if (!oldByContext.has(key)) oldByContext.set(key, []);
      oldByContext.get(key)!.push(old);
    }

    // ---------------------------------------------------------
    // STAGE 2: Context-Aware Geometry Matching
    // ---------------------------------------------------------
    for (const newE of Array.from(newPool)) {
      const key = getContextKey(newE);
      const candidates = oldByContext.get(key);
      if (candidates && candidates.length > 0) {
        for (let i = 0; i < candidates.length; i++) {
          const oldE = candidates[i];
          if (!oldPool.has(oldE)) continue;
          
          stats.stage2Comparisons++;
          if (isGeometryEqual(oldE.entityType, oldE.normalizedGeometry, newE.normalizedGeometry)) {
            pairUp(oldE, newE, 'GEOMETRY_CONTEXT');
            stats.stage2Matched++;
            break;
          }
        }
      }
    }
  }

  stats.stage3Candidates = oldPool.size + newPool.size;

  if (stats.stage3Candidates > 0) {
    const oldByContext = new Map<string, NormalizedCadEntity[]>();
    for (const old of oldPool) {
      const key = getContextKey(old);
      if (!oldByContext.has(key)) oldByContext.set(key, []);
      oldByContext.get(key)!.push(old);
    }

    // ---------------------------------------------------------
    // STAGE 3: Handle-Assisted Candidate Matching
    // ---------------------------------------------------------
    for (const newE of Array.from(newPool)) {
      const key = getContextKey(newE);
      const candidates = oldByContext.get(key);
      if (candidates && candidates.length > 0) {
        for (let i = 0; i < candidates.length; i++) {
          const oldE = candidates[i];
          if (!oldPool.has(oldE)) continue;
          
          stats.stage3Comparisons++;
          if (oldE.sourceId === newE.sourceId) {
            pairUp(oldE, newE, 'HANDLE');
            stats.stage3Matched++;
            break;
          }
        }
      }
    }
  }

  // ---------------------------------------------------------
  // STAGE 4: Spatial Matching
  // "Never make a nearby entity MODIFIED solely because it is spatially close."
  // So we skip aggressive spatial matching to avoid false MODIFIED.
  // ---------------------------------------------------------
  // We leave the remaining as unmatched.

  return {
    matches,
    unmatchedOld: Array.from(oldPool),
    unmatchedNew: Array.from(newPool),
    stats
  };
}

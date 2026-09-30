import type { NormalizedCadEntity, ComparisonChangeDetails, ComparisonChange, MatchMethod, ComparisonEntityReference } from '../types/comparison-types';
import { isGeometryEqual } from '../geometry/geometry-equality';

export function createEntityReference(entity: NormalizedCadEntity): ComparisonEntityReference {
  return {
    entityId: entity.sourceId,
    entityType: entity.entityType,
    layer: entity.layer,
    space: entity.space,
    layoutName: entity.layoutName,
    insertPath: entity.insertPath,
    blockName: entity.blockName
  };
}

export function compareEntities(
  oldE: NormalizedCadEntity,
  newE: NormalizedCadEntity,
  matchMethod: MatchMethod
): ComparisonChange {
  const geometryChanged = !isGeometryEqual(oldE.entityType, oldE.normalizedGeometry, newE.normalizedGeometry);
  const layerChanged = oldE.layer !== newE.layer;
  
  // Basic style checking for V1
  const oldStyleStr = JSON.stringify(oldE.normalizedStyle);
  const newStyleStr = JSON.stringify(newE.normalizedStyle);
  const styleChanged = oldStyleStr !== newStyleStr;

  // Since we require matched entities to be from the same space/layout/insertPath,
  // contextChanged should only be true if they moved across these, but our matcher
  // strictly enforces they are in the same context.
  const contextChanged = false;

  // Phase 5.20.7.1 - A layer is NOT a comparison change. 
  // Do NOT mark as modified if only the layer changed.
  const isModified = geometryChanged || styleChanged;

  const details: ComparisonChangeDetails = {
    geometryChanged,
    layerChanged,
    styleChanged,
    contextChanged,
    matchMethod,
    // Add confidence scoring if needed later
  };

  return {
    changeType: isModified ? 'MODIFIED' : 'UNCHANGED',
    entityType: newE.entityType,
    oldEntity: createEntityReference(oldE),
    newEntity: createEntityReference(newE),
    details
  };
}

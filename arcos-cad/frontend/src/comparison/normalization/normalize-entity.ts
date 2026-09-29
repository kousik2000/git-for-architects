import type { CadEntity } from '../../types/cad-json';
import type { NormalizedCadEntity } from '../types/comparison-types';
import { normalizeGeometry } from '../geometry/geometry-normalization';
import { generateMatchingSignature } from '../matching/entity-signature';

export interface NormalizationContext {
  space: string;
  layoutName?: string;
  insertPath: string[];
  blockName?: string;
  transform: number[];
}

export function normalizeEntity(
  entity: CadEntity,
  context: NormalizationContext
): NormalizedCadEntity {
  const normGeom = normalizeGeometry(entity);
  const normStyle = {
    color: entity.style?.color,
    trueColor: entity.style?.trueColor,
    linetype: entity.style?.linetype,
    lineweight: entity.style?.lineweight
  };

  const matchingSignature = generateMatchingSignature(
    entity.type,
    context.space,
    context.layoutName,
    context.insertPath,
    normGeom
  );

  return {
    sourceId: entity.id,
    entityType: entity.type,
    layer: entity.layer || '0',
    space: context.space,
    layoutName: context.layoutName,
    insertPath: context.insertPath,
    blockName: context.blockName,
    transform: context.transform,
    normalizedGeometry: normGeom,
    normalizedStyle: normStyle,
    matchingSignature,
    originalEntity: entity
  };
}

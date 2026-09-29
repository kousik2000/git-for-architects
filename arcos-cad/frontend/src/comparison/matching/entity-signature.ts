import type { NormalizedCadEntity } from '../types/comparison-types';
import { serializeNormalizedGeometry } from '../geometry/geometry-normalization';

export function generateMatchingSignature(
  entityType: string,
  space: string,
  layoutName: string | undefined,
  insertPath: string[],
  normalizedGeometry: any
): string {
  // Requirement 1: Do NOT make layer part of the only/primary comparison signature.
  // The matching signature represents the structural and geometric identity of the entity.
  const pathStr = insertPath.length > 0 ? insertPath.join('>') : 'root';
  const geomStr = serializeNormalizedGeometry(normalizedGeometry);
  const layoutStr = layoutName || '';
  
  return `${entityType}|${space}|${layoutStr}|${pathStr}|${geomStr}`;
}

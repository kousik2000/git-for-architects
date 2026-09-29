import type { ArcosCadDocument, CadEntity } from '../../types/cad-json';
import type { NormalizedCadEntity } from '../types/comparison-types';
import { normalizeEntity } from './normalize-entity';

export interface DocumentEntities {
  [space: string]: NormalizedCadEntity[];
}

export function normalizeDocument(doc: ArcosCadDocument): DocumentEntities {
  const result: DocumentEntities = {};

  const processEntity = (
    entity: CadEntity,
    context: NormalizationContext
  ) => {
    // For V1, we specifically support these geometry types.
    if (['LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC'].includes(entity.type)) {
      const norm = normalizeEntity(entity, context);
      if (!result[context.space]) {
        result[context.space] = [];
      }
      result[context.space].push(norm);
    } 
    else if (entity.type === 'INSERT') {
      // Extensible architecture: recurse into blocks to find lines/arcs inside inserts
      // keeping the insert context.
      const block = doc.blocks?.[entity.blockName];
      if (block) {
        const nextContext: NormalizationContext = {
          ...context,
          insertPath: [...context.insertPath, entity.id],
          blockName: entity.blockName,
          // Just storing the raw insertion point/rotation/scale as a context transform for now
          // In a real implementation this would be multiplied 4x4 matrices
          transform: [
            ...(context.transform || []),
            entity.geometry?.insertionPoint?.[0] || 0,
            entity.geometry?.insertionPoint?.[1] || 0,
            entity.geometry?.rotation || 0,
            entity.geometry?.scale?.[0] || 1
          ]
        };
        for (const child of block.entities) {
          processEntity(child, nextContext);
        }
      }
    }
  };

  // 1. Process Modelspace
  for (const entity of doc.entities || []) {
    processEntity(entity, {
      space: 'model',
      insertPath: [],
      transform: []
    });
  }

  // 2. Process Layouts
  if (doc.layouts) {
    for (const [layoutName, layout] of Object.entries(doc.layouts)) {
      for (const entity of layout.entities || []) {
        processEntity(entity, {
          space: 'layout',
          layoutName,
          insertPath: [],
          transform: []
        });
      }
    }
  }

  return result;
}

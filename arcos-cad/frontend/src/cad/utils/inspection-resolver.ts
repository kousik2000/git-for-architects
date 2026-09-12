import type { ArcosCadDocument, CadEntity, CadTextEntity } from '../../types/cad-json';
import type { SelectionReference } from '../renderer/CadRenderer';
import type { EntityInspection } from '../types/inspection';

const entityIndexCache = new WeakMap<ArcosCadDocument, Map<string, CadEntity>>();

function buildEntityIndex(doc: ArcosCadDocument): Map<string, CadEntity> {
  const map = new Map<string, CadEntity>();
  
  // Index modelspace/paperspace entities
  if (doc.entities) {
    for (const e of doc.entities) {
      map.set(e.id, e);
    }
  }

  // Index layouts
  if (doc.layouts) {
    for (const layoutName in doc.layouts) {
      const layout = doc.layouts[layoutName];
      if (layout && layout.entities) {
        for (const e of layout.entities) {
          map.set(e.id, e);
        }
      }
    }
  }

  // Index blocks
  if (doc.blocks) {
    for (const blockName in doc.blocks) {
      const block = doc.blocks[blockName];
      if (block && block.entities) {
        for (const e of block.entities) {
          map.set(e.id, e);
        }
      }
    }
  }

  return map;
}

export function getEntityById(doc: ArcosCadDocument, id: string): CadEntity | undefined {
  let map = entityIndexCache.get(doc);
  if (!map) {
    map = buildEntityIndex(doc);
    entityIndexCache.set(doc, map);
  }
  return map.get(id);
}

function resolveColor(entity: CadEntity): string | undefined {
  if (entity.style?.trueColor != null) {
    return `#${entity.style.trueColor.toString(16).padStart(6, '0')}`;
  }
  const color = entity.style?.color;
  if (color === 256) return 'ByLayer';
  if (color === 0) return 'ByBlock';
  if (color !== undefined) return `ACI ${color}`;
  return undefined;
}

function resolveLinetype(entity: CadEntity): string | undefined {
  const lt = entity.style?.linetype;
  if (!lt) return undefined;
  return lt;
}

export function resolveInspectionData(doc: ArcosCadDocument, ref: SelectionReference): EntityInspection | null {
  const entity = getEntityById(doc, ref.entityId);
  if (!entity) return null;

  const common = {
    entityId: entity.id,
    entityType: entity.type,
    layer: entity.layer,
    space: ref.space,
    insertPath: ref.insertPath || [],
    viewportId: ref.viewportId,
    color: resolveColor(entity),
    linetype: resolveLinetype(entity),
    lineweight: entity.style?.lineweight != null ? entity.style.lineweight.toString() : undefined
  };

  switch (entity.type) {
    case 'LINE':
      return {
        ...common,
        entityType: 'LINE',
        start: (entity.geometry as any).start,
        end: (entity.geometry as any).end,
        length: Math.hypot(
          (entity.geometry as any).end[0] - (entity.geometry as any).start[0],
          (entity.geometry as any).end[1] - (entity.geometry as any).start[1],
          (entity.geometry as any).end[2] - (entity.geometry as any).start[2]
        ),
        // Calculate angle in XY plane
        angle: (Math.atan2(
          (entity.geometry as any).end[1] - (entity.geometry as any).start[1],
          (entity.geometry as any).end[0] - (entity.geometry as any).start[0]
        ) * 180) / Math.PI
      } as any;
      
    case 'LWPOLYLINE':
      return {
        ...common,
        entityType: 'LWPOLYLINE',
        vertexCount: (entity.geometry as any).vertices?.length || 0,
        closed: !!(entity.geometry as any).closed,
        elevation: (entity.geometry as any).vertices && (entity.geometry as any).vertices.length > 0 ? ((entity.geometry as any).vertices[0][2] || 0) : 0
      } as any;

    case 'CIRCLE':
      return {
        ...common,
        entityType: 'CIRCLE',
        center: (entity.geometry as any).center || [0,0,0],
        radius: (entity.geometry as any).radius || 0,
        diameter: ((entity.geometry as any).radius || 0) * 2
      } as any;

    case 'ARC':
      return {
        ...common,
        entityType: 'ARC',
        center: (entity.geometry as any).center || [0,0,0],
        radius: (entity.geometry as any).radius || 0,
        startAngle: (((entity.geometry as any).startAngle || 0) * 180) / Math.PI,
        endAngle: (((entity.geometry as any).endAngle || 0) * 180) / Math.PI
      } as any;

    case 'SPLINE':
      return {
        ...common,
        entityType: 'SPLINE',
        degree: (entity.geometry as any).degree || 3,
        rational: !!(entity.geometry as any).rational,
        periodic: !!(entity.geometry as any).periodic,
        controlPointCount: (entity.geometry as any).controlPoints?.length || 0,
        fitPointCount: (entity.geometry as any).fitPoints?.length || 0,
        knotCount: (entity.geometry as any).knots?.length || 0,
        closed: !!(entity.geometry as any).closed
      } as any;

    case 'TEXT':
    case 'MTEXT': {
      const textEntity = entity as unknown as CadTextEntity;
      return {
        ...common,
        entityType: entity.type as 'TEXT' | 'MTEXT',
        text: textEntity.text || '',
        position: textEntity.geometry?.location || [0,0,0],
        height: textEntity.geometry?.height,
        rotation: textEntity.geometry?.rotation ? (textEntity.geometry.rotation * 180) / Math.PI : undefined,
        attachmentPoint: (textEntity.geometry as any)?.attachmentPoint
      } as any;
    }

    case 'HATCH':
      return {
        ...common,
        entityType: 'HATCH',
        patternName: (entity.geometry as any)?.patternName || 'SOLID',
        boundaryPathCount: (entity.geometry as any)?.boundaryPaths?.length || 0
      } as any;

    case 'INSERT':
      return {
        ...common,
        entityType: 'INSERT',
        blockName: (entity as any).blockName || '',
        position: (entity.geometry as any)?.insertionPoint || [0,0,0],
        rotation: (entity.geometry as any)?.rotation || 0,
        scale: (entity.geometry as any)?.scale || [1,1,1]
      } as any;

    case 'DIMENSION':
    case 'LEADER':
    case 'MLEADER':
    case 'ARC_DIMENSION':
      return {
        ...common,
        entityType: entity.type as 'DIMENSION' | 'LEADER' | 'MLEADER' | 'ARC_DIMENSION',
        virtualEntityCount: (entity.geometry as any)?.virtualEntities?.length || 0
      } as any;

    default:
      return {
        ...common,
        entityType: entity.type
      } as any;
  }
}

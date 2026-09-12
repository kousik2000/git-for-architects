import * as THREE from 'three';
import type { ArcosCadDocument, CadEntity, CadInsertEntity } from '../../types/cad-json';
import type { SelectionReference } from '../renderer/CadRenderer';
import { generateSnapCandidates } from './snap-utils';
import type { SnapCandidate } from '../types/measurement';

export interface SpatialEntity {
  entity: CadEntity;
  parentMatrix: THREE.Matrix4;
  reference: SelectionReference;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class CadSpatialIndex {
  private grid: Map<string, SpatialEntity[]> = new Map();
  private cellSize = 1000;
  private document: ArcosCadDocument | null = null;
  private activeSpace: string = 'model';
  private debugStats = {
    totalLines: 0,
    indexedLines: 0,
    indexedLwPoly: 0,
    indexedArcs: 0,
    indexedCircles: 0
  };

  public build(doc: ArcosCadDocument, space: string) {
    this.document = doc;
    this.activeSpace = space;
    this.grid.clear();

    const entities = space === 'model' 
      ? doc.entities 
      : (doc.layouts[space]?.entities || []);

    this.debugStats = { totalLines: 0, indexedLines: 0, indexedLwPoly: 0, indexedArcs: 0, indexedCircles: 0 };
    
    // Count total lines in this space
    this.debugStats.totalLines = entities.filter(e => e.type === 'LINE').length;
    // We should ideally count lines in blocks too, but let's keep it simple or we can just count during traversal.
    
    const identityMat = new THREE.Matrix4();
    this.traverseAndIndex(entities, identityMat, doc, 0, [], space);
    
    console.log(`[CadSpatialIndex] Built index for ${space} with ${this.grid.size} cells.`);
    console.log(`[CadSpatialIndex] Total CAD LINE entities in base space: ${this.debugStats.totalLines}`);
    console.log(`[CadSpatialIndex] Number of LINE entities indexed: ${this.debugStats.indexedLines}`);
    console.log(`[CadSpatialIndex] Number of LWPOLYLINE entities indexed: ${this.debugStats.indexedLwPoly}`);
    console.log(`[CadSpatialIndex] Number of ARC entities indexed: ${this.debugStats.indexedArcs}`);
    console.log(`[CadSpatialIndex] Number of CIRCLE entities indexed: ${this.debugStats.indexedCircles}`);
  }

  private traverseAndIndex(
    entities: CadEntity[], 
    parentMatrix: THREE.Matrix4, 
    doc: ArcosCadDocument, 
    depth: number,
    insertPath: string[],
    space: string
  ) {
    if (depth > 20) return;

    for (const entity of entities) {
      // 1. If it's an INSERT, recursively index its block entities
      if (entity.type === 'INSERT') {
        const insertEntity = entity as CadInsertEntity;
        const block = doc.blocks ? doc.blocks[insertEntity.blockName] : null;
        if (block && block.entities) {
          const insertMat = new THREE.Matrix4();
          const position = new THREE.Vector3(...(insertEntity.geometry.insertionPoint || [0,0,0]));
          const euler = new THREE.Euler(0, 0, THREE.MathUtils.degToRad(insertEntity.geometry.rotation || 0));
          const quaternion = new THREE.Quaternion().setFromEuler(euler);
          const scale = new THREE.Vector3(...(insertEntity.geometry.scale || [1, 1, 1]));
          insertMat.compose(position, quaternion, scale);
          
          const basePoint = block.basePoint || [0,0,0];
          const baseOffset = new THREE.Matrix4().makeTranslation(-basePoint[0], -basePoint[1], -basePoint[2]);
          insertMat.multiply(baseOffset);
          
          const finalMatrix = parentMatrix.clone().multiply(insertMat);
          this.traverseAndIndex(block.entities, finalMatrix, doc, depth + 1, [...insertPath, entity.id], space);
        }
        continue;
      }

      // 2. Only index snappable entities
      if (!['LINE', 'LWPOLYLINE', 'ARC', 'CIRCLE'].includes(entity.type)) {
        continue;
      }

      // Check visibility/frozen state if possible (assume visible for now, or check layers)
      const docLayer = doc.layers.find(l => l.name === entity.layer);
      if (docLayer && (!docLayer.visible || docLayer.frozen)) {
        continue; // Skip hidden layers
      }

      // 3. Compute rough AABB for the entity
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      const expandBounds = (pt: THREE.Vector3) => {
        const p = pt.clone().applyMatrix4(parentMatrix);
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      };

      if (entity.type === 'LINE' && entity.geometry) {
        this.debugStats.indexedLines++;
        expandBounds(new THREE.Vector3(entity.geometry.start[0], entity.geometry.start[1], entity.geometry.start[2] || 0));
        expandBounds(new THREE.Vector3(entity.geometry.end[0], entity.geometry.end[1], entity.geometry.end[2] || 0));
      } else if (entity.type === 'LWPOLYLINE' && entity.geometry?.vertices) {
        this.debugStats.indexedLwPoly++;
        for (const v of entity.geometry.vertices) {
          expandBounds(new THREE.Vector3(v.x, v.y, 0));
        }
      } else if ((entity.type === 'CIRCLE' || entity.type === 'ARC') && entity.geometry) {
        if (entity.type === 'CIRCLE') this.debugStats.indexedCircles++;
        if (entity.type === 'ARC') this.debugStats.indexedArcs++;
        const center = new THREE.Vector3(...entity.geometry.center);
        const r = entity.geometry.radius || 0;
        // Approximation: box around the circle
        expandBounds(new THREE.Vector3(center.x - r, center.y - r, center.z));
        expandBounds(new THREE.Vector3(center.x + r, center.y + r, center.z));
      }

      if (minX !== Infinity) {
        // Expand bounds slightly to catch near misses
        const padding = 10;
        minX -= padding; minY -= padding; maxX += padding; maxY += padding;

        const spatialEntity: SpatialEntity = {
          entity,
          parentMatrix,
          reference: {
            entityId: entity.id,
            entityType: entity.type,
            layer: entity.layer,
            insertPath: [...insertPath],
            space: space
          },
          minX, minY, maxX, maxY
        };

        this.insertIntoGrid(spatialEntity);
      }
    }
  }

  private insertIntoGrid(se: SpatialEntity) {
    const minCol = Math.floor(se.minX / this.cellSize);
    const maxCol = Math.floor(se.maxX / this.cellSize);
    const minRow = Math.floor(se.minY / this.cellSize);
    const maxRow = Math.floor(se.maxY / this.cellSize);

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const key = `${c},${r}`;
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(se);
      }
    }
  }

  public queryCandidates(worldX: number, worldY: number, tolerance: number): SnapCandidate[] {
    const minCol = Math.floor((worldX - tolerance) / this.cellSize);
    const maxCol = Math.floor((worldX + tolerance) / this.cellSize);
    const minRow = Math.floor((worldY - tolerance) / this.cellSize);
    const maxRow = Math.floor((worldY + tolerance) / this.cellSize);

    const candidates: SnapCandidate[] = [];
    const seenEntities = new Set<string>();
    const worldPoint = new THREE.Vector3(worldX, worldY, 0);

    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        const key = `${c},${r}`;
        const list = this.grid.get(key);
        if (list) {
          for (const se of list) {
            // Unique identifier for the entity instance in its specific insert path
            const instanceId = `${se.reference.entityId}-${se.reference.insertPath.join(',')}`;
            if (seenEntities.has(instanceId)) continue;
            seenEntities.add(instanceId);

            // Fast AABB check with tolerance
            if (worldX + tolerance < se.minX || worldX - tolerance > se.maxX ||
                worldY + tolerance < se.minY || worldY - tolerance > se.maxY) {
              continue;
            }

            // Generate candidates for this entity
            const entityCandidates = generateSnapCandidates(se.entity, se.parentMatrix, se.reference, worldPoint);
            candidates.push(...entityCandidates);
          }
        }
      }
    }

    return candidates;
  }
}

import * as THREE from 'three';
import type { ArcosCadDocument, CadEntity } from '../../types/cad-json';

export class CadTransformResolver {
  
  /**
   * Resolves the cumulative transformation matrix for a given insert path.
   * Useful when picking an entity deeply nested inside INSERTs to resolve its 
   * coordinates back to world space or vice versa.
   * 
   * @param document - The CAD document for resolving entity data
   * @param insertPath - Array of INSERT entity IDs (from root to leaf)
   * @returns A Matrix4 representing the composed transformation
   */
  public static resolveInsertPathTransform(
    document: ArcosCadDocument,
    insertPath: string[]
  ): THREE.Matrix4 {
    const parentMatrix = new THREE.Matrix4();
    
    if (!insertPath || insertPath.length === 0) {
      return parentMatrix;
    }

    // Optimization: Build a quick lookup map if we are doing this frequently,
    // or rely on a centralized lookup. For now, since documents aren't mutated
    // during a view session, we can do a linear search or rely on an external map.
    // However, to keep this self-contained and accurate without rewriting the 
    // entire O(N) search logic inside this utility, we'll scan the document.
    // Ideally, the caller provides an O(1) resolver function, but let's provide 
    // a basic implementation here and overload it if necessary.
    
    // We assume the caller might want to provide their own entity lookup for performance
    const findEntity = (id: string): CadEntity | undefined => {
      // Basic O(N) fallback if needed, but usually we just do this:
      return document.entities.find((e: CadEntity) => e.id === id);
    };

    for (const insertId of insertPath) {
      const insertEntity = findEntity(insertId) as any;
      if (insertEntity && insertEntity.type === 'INSERT' && insertEntity.geometry) {
        const geom = insertEntity.geometry;
        const matrix = new THREE.Matrix4();
        matrix.compose(
          new THREE.Vector3(geom.insertionPoint[0], geom.insertionPoint[1], geom.insertionPoint[2]),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), geom.rotation || 0),
          new THREE.Vector3(geom.scale[0], geom.scale[1], geom.scale[2])
        );
        parentMatrix.multiply(matrix);
      }
    }

    return parentMatrix;
  }

  /**
   * Version of the resolver that takes a pre-bound lookup function (e.g. from CadRenderer)
   * which may use O(1) mapping under the hood.
   */
  public static resolveTransformWithLookup(
    insertPath: string[],
    findEntityById: (id: string) => CadEntity | undefined
  ): THREE.Matrix4 {
    const parentMatrix = new THREE.Matrix4();
    
    if (!insertPath || insertPath.length === 0) {
      return parentMatrix;
    }

    for (const insertId of insertPath) {
      const insertEntity = findEntityById(insertId) as any;
      if (insertEntity && insertEntity.type === 'INSERT' && insertEntity.geometry) {
        const geom = insertEntity.geometry;
        const matrix = new THREE.Matrix4();
        matrix.compose(
          new THREE.Vector3(geom.insertionPoint[0], geom.insertionPoint[1], geom.insertionPoint[2]),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), geom.rotation || 0),
          new THREE.Vector3(geom.scale[0], geom.scale[1], geom.scale[2])
        );
        parentMatrix.multiply(matrix);
      }
    }

    return parentMatrix;
  }
}

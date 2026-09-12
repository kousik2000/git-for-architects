import * as THREE from 'three';
import type { CadEntity } from '../../types/cad-json';
import type { SelectionReference } from '../renderer/CadRenderer';
import type { MeasurementReference } from '../types/measurement';
import { CadTransformResolver } from '../transforms/CadTransformResolver';
import { findClosestSnapCandidate } from './snap-utils';
import { CadSpatialIndex } from './CadSpatialIndex';

export interface CadPickingContext {
  camera: THREE.OrthographicCamera;
  getDocument: () => any; // Returns ArcosCadDocument or null
  rendererDomElement: HTMLElement;
  getActiveSpace: () => string;
  zoomTolerancePixels: number;
}

export class CadPicker {
  private context: CadPickingContext;
  private spatialIndex: CadSpatialIndex = new CadSpatialIndex();
  private lastIndexedDoc: any = null;
  private lastIndexedSpace: string = '';

  constructor(context: CadPickingContext) {
    this.context = context;
  }

  /**
   * Translates screen coordinates to normalized device coordinates (NDC).
   */
  private getNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.context.rendererDomElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    return new THREE.Vector2(x, y);
  }

  /**
   * Retrieves precise CAD world coordinates mapped from the exact screen pointer position.
   * Note: This does NOT do snapping, it just hits the Z=0 plane (or relevant projection plane).
   */
  public getWorldPointFromScreen(clientX: number, clientY: number): THREE.Vector3 {
    const ndc = this.getNDC(clientX, clientY);
    const vec = new THREE.Vector3(ndc.x, ndc.y, 0);
    vec.unproject(this.context.camera);
    // Force Z to 0 so unproject's arbitrary Z doesn't ruin distance calculations
    vec.z = 0;
    return vec;
  }

  /**
   * Generates candidates using the global CadSpatialIndex.
   * Decoupled from hover, uses O(log N) lookup.
   */
  public findSnapCandidates(
    screenX: number, 
    screenY: number,
    enabledTypes: Record<string, boolean>
  ): MeasurementReference | null {
    const document = this.context.getDocument();
    if (!document) return null;

    const activeSpace = this.context.getActiveSpace();
    
    // Lazily rebuild spatial index if document or space changed
    if (this.lastIndexedDoc !== document || this.lastIndexedSpace !== activeSpace) {
      this.spatialIndex.build(document, activeSpace);
      this.lastIndexedDoc = document;
      this.lastIndexedSpace = activeSpace;
    }

    const worldPoint = this.getWorldPointFromScreen(screenX, screenY);

    // Scale tolerance by zoom so it remains screen-pixel consistent
    const viewWidth = (this.context.camera.right - this.context.camera.left) / this.context.camera.zoom;
    const unitsPerPixel = viewWidth / this.context.rendererDomElement.clientWidth;
    const worldTolerance = this.context.zoomTolerancePixels * unitsPerPixel;

    // Query spatial index for all candidates near the pointer
    const allCandidates = this.spatialIndex.queryCandidates(worldPoint.x, worldPoint.y, worldTolerance);
    
    // Filter by enabled types
    const candidates = allCandidates.filter(c => enabledTypes[c.type]);

    if (candidates.length === 0) return null;

    const closest = findClosestSnapCandidate(candidates, worldPoint, worldTolerance);
    
    if (!closest) return null;

    return {
      entityId: closest.entityId,
      entityType: closest.entityType,
      layer: closest.layer,
      point: closest.point,
      snapType: closest.type,
      insertPath: closest.insertPath,
      space: closest.space,
      viewportId: closest.viewportId
    };
  }
}

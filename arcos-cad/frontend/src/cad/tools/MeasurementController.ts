import * as THREE from 'three';
import type { MeasurementReference } from '../types/measurement';

export enum MeasurementState {
  IDLE = 'IDLE',
  FIRST_POINT_PENDING = 'FIRST_POINT_PENDING',
  SECOND_POINT_PENDING = 'SECOND_POINT_PENDING',
  COMPLETE = 'COMPLETE' // Transitory state before returning to FIRST_POINT_PENDING
}

export interface DistanceMeasurement {
  id: string;
  point1: THREE.Vector3;
  point2: THREE.Vector3;
  distance: number;
  // Snap references if any
  snap1: MeasurementReference | null;
  snap2: MeasurementReference | null;
}

export type MeasurementUpdateCallback = (
  state: MeasurementState,
  activePreview: { point1: THREE.Vector3; currentPoint: THREE.Vector3; distance: number } | null,
  history: DistanceMeasurement[]
) => void;

export class MeasurementController {
  private state: MeasurementState = MeasurementState.IDLE;
  
  private currentPoint1: THREE.Vector3 | null = null;
  private currentSnap1: MeasurementReference | null = null;
  
  private currentPreviewPoint: THREE.Vector3 | null = null;
  
  private measurements: DistanceMeasurement[] = [];
  
  private onUpdateCallback?: MeasurementUpdateCallback;

  constructor(onUpdate?: MeasurementUpdateCallback) {
    this.onUpdateCallback = onUpdate;
  }

  public setOnUpdateCallback(callback: MeasurementUpdateCallback) {
    this.onUpdateCallback = callback;
  }

  public getState(): MeasurementState {
    return this.state;
  }

  public isActive(): boolean {
    return this.state !== MeasurementState.IDLE;
  }

  public getHistory(): DistanceMeasurement[] {
    return this.measurements;
  }

  public start() {
    if (this.state === MeasurementState.IDLE) {
      this.state = MeasurementState.FIRST_POINT_PENDING;
      this.currentPoint1 = null;
      this.currentSnap1 = null;
      this.currentPreviewPoint = null;
      this.notifyUpdate();
    }
  }

  public cancel() {
    if (this.state !== MeasurementState.IDLE) {
      this.state = MeasurementState.IDLE;
      this.currentPoint1 = null;
      this.currentSnap1 = null;
      this.currentPreviewPoint = null;
      this.notifyUpdate();
    }
  }
  
  public clearMeasurements() {
    this.measurements = [];
    this.notifyUpdate();
  }

  /**
   * Called when the pointer moves. Updates the live preview.
   * Returns true if the controller consumed the event.
   */
  public handlePointerMove(worldPoint: THREE.Vector3, snap: MeasurementReference | null): boolean {
    if (!this.isActive()) return false;
    
    // Always track the current "best" point (snapped, or raw world)
    const activePoint = snap ? new THREE.Vector3(snap.point.x, snap.point.y, snap.point.z || 0) : worldPoint.clone();

    if (this.state === MeasurementState.SECOND_POINT_PENDING) {
      this.currentPreviewPoint = activePoint;
      this.notifyUpdate();
      return true;
    }
    
    return true; // We consume move events in measurement mode
  }

  /**
   * Called on pointer up (click). Transitions state.
   * Returns true if the controller consumed the event.
   */
  public handlePointClick(worldPoint: THREE.Vector3, snap: MeasurementReference | null): boolean {
    if (!this.isActive()) return false;

    const activePoint = snap ? new THREE.Vector3(snap.point.x, snap.point.y, snap.point.z || 0) : worldPoint.clone();

    if (this.state === MeasurementState.FIRST_POINT_PENDING) {
      this.currentPoint1 = activePoint;
      this.currentSnap1 = snap;
      this.currentPreviewPoint = activePoint;
      this.state = MeasurementState.SECOND_POINT_PENDING;
      this.notifyUpdate();
      return true;
    }

    if (this.state === MeasurementState.SECOND_POINT_PENDING) {
      if (!this.currentPoint1) return false;
      
      const dist = this.calculateDistance(this.currentPoint1, activePoint);
      
      const measurement: DistanceMeasurement = {
        id: `meas_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        point1: this.currentPoint1,
        point2: activePoint,
        distance: dist,
        snap1: this.currentSnap1,
        snap2: snap
      };
      
      this.measurements.push(measurement);
      
      // Auto-restart for next measurement, clearing the preview immediately
      this.currentPoint1 = null;
      this.currentSnap1 = null;
      this.currentPreviewPoint = null;
      this.state = MeasurementState.IDLE; // User requested we drop to IDLE, or we can restart FIRST_POINT_PENDING. Actually, if we return to IDLE, they have to click 'Measure' again? The user said: "Exit Measurement mode" on ESC, but what about after 2nd point? Let's leave it as FIRST_POINT_PENDING but ensure preview is cleared.
      this.state = MeasurementState.FIRST_POINT_PENDING;
      
      this.notifyUpdate();
      return true;
    }

    return false;
  }

  public getActivePreview() {
    if (this.state === MeasurementState.SECOND_POINT_PENDING && this.currentPoint1 && this.currentPreviewPoint) {
      return {
        point1: this.currentPoint1,
        currentPoint: this.currentPreviewPoint,
        distance: this.calculateDistance(this.currentPoint1, this.currentPreviewPoint)
      };
    }
    return null;
  }

  private calculateDistance(p1: THREE.Vector3, p2: THREE.Vector3): number {
    // 2D distance for now as requested
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private notifyUpdate() {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.state, this.getActivePreview(), this.measurements);
    }
  }
}

import type { CadConfiguration } from '../config/CadConfiguration';
import type { MeasurementReference } from '../types/measurement';
import type { SelectionReference } from '../renderer/CadRenderer';
import { CadPicker } from '../picking/CadPicker';

export class CadSnapController {
  private config: CadConfiguration['snapping'];
  private currentSnap: MeasurementReference | null = null;
  private onSnapChangedCallback?: (snap: MeasurementReference | null) => void;

  private picker: CadPicker;

  constructor(
    picker: CadPicker,
    config: CadConfiguration['snapping'],
    onSnapChanged?: (snap: MeasurementReference | null) => void
  ) {
    this.picker = picker;
    this.config = config;
    this.onSnapChangedCallback = onSnapChanged;
  }

  public updateConfig(config: CadConfiguration['snapping']) {
    console.log(`[snap-debug] configuration enabled=${config.enabled} endpoint=${config.enabledTypes?.endpoint} midpoint=${config.enabledTypes?.midpoint} center=${config.enabledTypes?.center} nearest=${config.enabledTypes?.nearest} tolerancePixels=${config.tolerancePixels}`);
    this.config = config;
    if (!this.config.enabled && this.currentSnap !== null) {
      this.clearSnap();
    }
  }

  public evaluateHit(screenX: number, screenY: number): void {
    console.log(`[snap-debug] evaluateHit enabled=${this.config.enabled} x=${screenX} y=${screenY}`);
    if (!this.config.enabled) {
      this.clearSnap();
      return;
    }

    // picker needs the zoomTolerance from config
    // Actually, picking context holds zoomTolerancePixels, so we should update it if it changed
    // Let's assume the caller updates CadPicker's context if needed. We'll just call findSnapCandidates
    
    const candidate = this.picker.findSnapCandidates(
      screenX, 
      screenY, 
      this.config.enabledTypes
    );
    console.log(`[snap-debug] selected candidate:`, candidate);

    if (!this.isSameCandidate(this.currentSnap, candidate)) {
      this.currentSnap = candidate;
      if (this.onSnapChangedCallback) {
        this.onSnapChangedCallback(this.currentSnap);
      }
    }
  }

  public clearSnap(): void {
    if (this.currentSnap !== null) {
      this.currentSnap = null;
      if (this.onSnapChangedCallback) {
        this.onSnapChangedCallback(null);
      }
    }
  }

  public getCurrentSnap(): MeasurementReference | null {
    return this.currentSnap;
  }


  private isSameCandidate(a: MeasurementReference | null, b: MeasurementReference | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    // Using a tiny epsilon
    const epsilon = 1e-6;
    return a.entityId === b.entityId &&
           a.snapType === b.snapType &&
           Math.abs(a.point.x - b.point.x) < epsilon &&
           Math.abs(a.point.y - b.point.y) < epsilon &&
           Math.abs(a.point.z - b.point.z) < epsilon;
  }
}

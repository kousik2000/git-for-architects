export interface MeasurementPoint {
  x: number;
  y: number;
  z: number;
}

export type SnapType = 'endpoint' | 'midpoint' | 'center' | 'nearest';

export interface SnapCandidate {
  type: SnapType;
  point: MeasurementPoint;
  entityId: string;
  entityType: string;
  layer: string;
  distance: number;
  insertPath: string[];
  space: 'model' | 'layout';
  viewportId?: string;
}

export interface MeasurementReference {
  entityId: string;
  entityType: string;
  layer: string;
  point: MeasurementPoint;
  snapType: SnapType;
  insertPath: string[];
  space: 'model' | 'layout';
  viewportId?: string;
}

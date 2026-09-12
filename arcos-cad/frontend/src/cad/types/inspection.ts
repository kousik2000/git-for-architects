export interface EntityInspectionCommon {
  entityId: string;
  entityType: string;
  layer: string;
  space: 'model' | 'layout';
  insertPath: string[];
  viewportId?: string;

  color?: string; // 'ByLayer', 'ByBlock', or hex string like '#ff0000'
  linetype?: string;
  lineweight?: string;
}

export interface InspectionLine extends EntityInspectionCommon {
  entityType: 'LINE';
  start: [number, number, number];
  end: [number, number, number];
  length?: number;
  angle?: number; // In degrees
}

export interface InspectionLwPolyline extends EntityInspectionCommon {
  entityType: 'LWPOLYLINE';
  vertexCount: number;
  closed: boolean;
  elevation: number;
}

export interface InspectionCircle extends EntityInspectionCommon {
  entityType: 'CIRCLE';
  center: [number, number, number];
  radius: number;
  diameter?: number;
}

export interface InspectionArc extends EntityInspectionCommon {
  entityType: 'ARC';
  center: [number, number, number];
  radius: number;
  startAngle: number; // In degrees for display
  endAngle: number;
}

export interface InspectionSpline extends EntityInspectionCommon {
  entityType: 'SPLINE';
  degree: number;
  rational: boolean;
  periodic: boolean;
  controlPointCount: number;
  fitPointCount: number;
  knotCount: number;
  closed: boolean;
}

export interface InspectionText extends EntityInspectionCommon {
  entityType: 'TEXT';
  text: string;
  position: [number, number, number];
  height?: number;
  rotation?: number;
}

export interface InspectionMText extends EntityInspectionCommon {
  entityType: 'MTEXT';
  text: string;
  position: [number, number, number];
  height?: number;
  rotation?: number;
  attachmentPoint?: number;
}

export interface InspectionHatch extends EntityInspectionCommon {
  entityType: 'HATCH';
  patternName: string;
  boundaryPathCount: number;
}

export interface InspectionInsert extends EntityInspectionCommon {
  entityType: 'INSERT';
  blockName: string;
  position: [number, number, number];
  rotation: number;
  scale: [number, number, number];
}

export interface InspectionSolid extends EntityInspectionCommon {
  entityType: 'SOLID';
  vertexCount: number;
}

export interface InspectionDimension extends EntityInspectionCommon {
  entityType: 'DIMENSION' | 'LEADER' | 'MLEADER' | 'ARC_DIMENSION';
  virtualEntityCount: number;
}

export interface InspectionGeneric extends EntityInspectionCommon {
  entityType: string;
}

export type EntityInspection = 
  | InspectionLine 
  | InspectionLwPolyline 
  | InspectionCircle 
  | InspectionArc 
  | InspectionSpline 
  | InspectionText 
  | InspectionMText 
  | InspectionHatch 
  | InspectionInsert 
  | InspectionSolid 
  | InspectionDimension 
  | InspectionGeneric;

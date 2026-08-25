export interface CadDocumentInfo {
  name: string;
  format: string;
}

export interface CadUnits {
  name: string | null;
  code: string | null;
  ltscale?: number | null; // Added in 5.9A
}

export interface CadBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface CadLayer {
  name: string;
  color: number;
  trueColor?: number | null; // Added in 5.9A
  linetype: string | null;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
}

export interface CadBlock {
  name: string;
  basePoint: [number, number, number];
  entities: CadEntity[];
}

export interface CadStyle {
  color: number;
  trueColor?: number | null; // Added in 5.9A
  linetype: string | null;
  lineweight: number | null;
  ltscale?: number | null; // Added in 5.9A
}

export interface CadEntityBase {
  id: string;
  type: string;
  layer: string;
  style: CadStyle;
}

export interface CadLineEntity extends CadEntityBase {
  type: 'LINE';
  geometry: {
    start: [number, number, number];
    end: [number, number, number];
  };
}

export interface CadLwPolylineEntity extends CadEntityBase {
  type: 'LWPOLYLINE';
  geometry: {
    vertices: [number, number, number, number][]; // [x, y, z, bulge]
    closed: boolean;
  };
}
export type CadHatchEdge =
  | { type: 'LineEdge'; start: [number, number]; end: [number, number] }
  | { type: 'ArcEdge'; center: [number, number]; radius: number; startAngle: number; endAngle: number; ccw: boolean }
  | { type: 'EllipseEdge'; center: [number, number]; majorAxisEndPoint: [number, number]; ratio: number; startAngle: number; endAngle: number; ccw: boolean }
  | { type: 'SplineEdge'; degree: number; controlPoints: [number, number][]; knots: number[]; weights: number[] };

export type CadHatchBoundaryPath =
  | { type: 'EdgePath'; pathTypeFlags: number; edges: CadHatchEdge[] }
  | { type: 'PolylinePath'; pathTypeFlags: number; isClosed: boolean | number; vertices: [number, number, number][] }; // [x, y, bulge]

export interface CadHatchEntity extends CadEntityBase {
  type: 'HATCH';
  geometry: {
    solidFill: boolean;
    patternName: string;
    boundaryPaths: CadHatchBoundaryPath[];
  };
}

export interface CadTextEntity extends CadEntityBase {
  type: 'TEXT' | 'MTEXT';
  text: string;
  geometry: {
    location: [number, number, number];
    height?: number; // Added in 5.9A
    rotation?: number; // Added in 5.9A
    halign?: number; // Added in 5.9A
    valign?: number; // Added in 5.9A
  };
}

export interface CadInsertEntity extends CadEntityBase {
  type: 'INSERT';
  blockName: string;
  geometry: {
    insertionPoint: [number, number, number];
    rotation: number;
    scale: [number, number, number];
  };
}

export interface CadSplineEntity extends CadEntityBase {
  type: 'SPLINE';
  geometry: {
    controlPoints: [number, number, number][];
    closed: boolean;
    degree: number;
    knots: number[];
    rational: boolean;
    periodic: boolean;
    weights?: number[];
    fitPoints?: [number, number, number][];
  };
}

// We map all unsupported/unknown entity types to a generic interface for now
export interface CadGenericEntity extends CadEntityBase {
  type: Exclude<string, 'LINE' | 'LWPOLYLINE' | 'HATCH' | 'TEXT' | 'INSERT' | 'SPLINE' | 'DIMENSION' | 'LEADER' | 'MLEADER' | 'ARC_DIMENSION'>;
  geometry: any;
}

export interface CadDimensionEntity extends CadEntityBase {
  type: 'DIMENSION' | 'LEADER' | 'MLEADER' | 'ARC_DIMENSION';
  geometry: {
    virtualEntities: CadEntity[];
  };
}

export type CadEntity = CadLineEntity | CadLwPolylineEntity | CadHatchEntity | CadTextEntity | CadInsertEntity | CadSplineEntity | CadDimensionEntity | CadGenericEntity;

export interface CadStatistics {
  totalEntities: number;
  supportedEntities: number;
  unsupportedEntities: number;
  layers: number;
  blocks: number;
  parsingTimeMs: number;
  renderedArcs: number;
  renderedEllipses: number;
  renderedPoints: number;
  renderedDimensions: number;
  renderedLeaders: number;
  renderedMLeaders: number;
  renderedArcDimensions: number;
  renderedMTexts: number;
  entityTypes: Record<string, number>;
}

export interface CadWarning {
  code: string;
  message: string;
  entityType?: string;
}

export interface CadLinetype {
  name: string;
  description: string;
  pattern: number[];
  length: number;
}

export interface CadLayout {
  name: string;
  entities: CadEntity[];
}

export interface ArcosCadDocument {
  version: string;
  document: CadDocumentInfo;
  units: CadUnits;
  bounds: CadBounds;
  layers: CadLayer[];
  blocks: Record<string, CadBlock>;
  layouts: Record<string, CadLayout>;
  entities: CadEntity[];
  statistics: CadStatistics;
  warnings: CadWarning[];
  linetypes?: Record<string, CadLinetype>; // Added in 5.9A
}

export interface CadParseResponse {
  success: boolean;
  data: ArcosCadDocument;
}

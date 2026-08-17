export interface CadDocumentInfo {
  name: string;
  format: string;
}

export interface CadUnits {
  name: string | null;
  code: string | null;
}

export interface CadBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface CadLayer {
  name: string;
  color: number;
  linetype: string | null;
  visible: boolean;
  frozen: boolean;
  locked: boolean;
}

export interface CadBlock {
  name: string;
  basePoint: [number, number, number];
}

export interface CadStyle {
  color: number;
  linetype: string | null;
  lineweight: number | null;
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

export interface CadHatchEntity extends CadEntityBase {
  type: 'HATCH';
  geometry: {
    solid_fill: number;
    pattern_name: string;
  };
}

export interface CadTextEntity extends CadEntityBase {
  type: 'TEXT';
  text: string;
  geometry: {
    location: [number, number, number];
  };
}

// We map all unsupported/unknown entity types to a generic interface for now
export interface CadGenericEntity extends CadEntityBase {
  type: Exclude<string, 'LINE' | 'LWPOLYLINE' | 'HATCH' | 'TEXT'>;
  geometry: any;
}

export type CadEntity = CadLineEntity | CadLwPolylineEntity | CadHatchEntity | CadTextEntity | CadGenericEntity;

export interface CadStatistics {
  totalEntities: number;
  supportedEntities: number;
  unsupportedEntities: number;
  layers: number;
  blocks: number;
  parsingTimeMs: number;
  entityTypes: Record<string, number>;
}

export interface CadWarning {
  code: string;
  message: string;
  entityType?: string;
}

export interface ArcosCadDocument {
  version: string;
  document: CadDocumentInfo;
  units: CadUnits;
  bounds: CadBounds;
  layers: CadLayer[];
  blocks: CadBlock[];
  layouts: any[];
  entities: CadEntity[];
  statistics: CadStatistics;
  warnings: CadWarning[];
}

export interface CadParseResponse {
  success: boolean;
  data: ArcosCadDocument;
}

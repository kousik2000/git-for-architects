import type { CadEntity } from '../../types/cad-json';

export type ChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED';
export type MatchMethod = 'EXACT_SIGNATURE' | 'GEOMETRY_CONTEXT' | 'HANDLE' | 'SPATIAL';

export const COMPARISON_COLORS = {
  ADDED: 0x2ecc71,
  REMOVED: 0xe74c3c,
  MODIFIED: 0xf1c40f,
  UNCHANGED: 0xbdc3c7
};

export const COMPARISON_COLORS_CSS = {
  ADDED: '#2ecc71',
  REMOVED: '#e74c3c',
  MODIFIED: '#f1c40f',
  UNCHANGED: '#bdc3c7'
};

export interface ComparisonEntityReference {
  entityId: string;
  entityType: string;
  layer: string;
  space: string;
  layoutName?: string;
  insertPath: string[];
  blockName?: string;
}

export interface ComparisonChangeDetails {
  geometryChanged: boolean;
  layerChanged: boolean;
  styleChanged: boolean;
  contextChanged: boolean;
  matchMethod?: MatchMethod;
  confidenceScore?: number;
}

export interface ComparisonChange {
  changeType: ChangeType;
  entityType: string;
  oldEntity?: ComparisonEntityReference;
  newEntity?: ComparisonEntityReference;
  details?: ComparisonChangeDetails;
}

export interface ComparisonSpaceResult {
  space: string;
  layoutName?: string;
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  changes: ComparisonChange[];
}

export interface ComparisonResult {
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
  spaces: ComparisonSpaceResult[];
}

export interface NormalizedCadEntity {
  sourceId: string;
  entityType: string;
  layer: string;
  space: string;
  layoutName?: string;
  insertPath: string[];
  blockName?: string;
  transform: number[]; // e.g. 4x4 matrix or simplified transform context
  
  normalizedGeometry: any;
  normalizedStyle: any;
  
  // Signatures
  matchingSignature: string; // strict geometry + context/layer
  
  // Back reference to original
  originalEntity: CadEntity;
}

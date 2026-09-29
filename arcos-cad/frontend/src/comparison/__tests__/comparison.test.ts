import { compareCadDocuments } from '../comparison/compare-documents';
import type { ArcosCadDocument, CadLineEntity, CadCircleEntity, CadArcEntity, CadLwPolylineEntity, CadInsertEntity } from '../../types/cad-json';

function createEmptyDoc(): ArcosCadDocument {
  return {
    version: '1.0',
    document: { name: 'test', format: 'json' },
    units: { name: 'mm', code: 'mm' },
    bounds: { min: [0, 0, 0], max: [100, 100, 0] },
    layers: [{ name: '0', color: 7, visible: true, frozen: false, locked: false, linetype: null }],
    blocks: {},
    layouts: {},
    entities: [],
    statistics: {} as any,
    warnings: []
  };
}

describe('CAD Comparison Engine', () => {
  it('TEST 1: unchanged LINE', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    const line: CadLineEntity = {
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    };
    oldDoc.entities.push(line);
    newDoc.entities.push(line);

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 1 });
  });

  it('TEST 2 & 3: added and removed LINE', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    const lineA: CadLineEntity = {
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    };
    const lineB: CadLineEntity = {
      id: 'L2', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 10, 0], end: [100, 10, 0] }
    };
    
    oldDoc.entities.push(lineA); // Exists in both
    newDoc.entities.push(lineA); 
    
    newDoc.entities.push(lineB); // Added in new
    
    const lineC: CadLineEntity = {
      id: 'L3', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 20, 0], end: [100, 20, 0] }
    };
    oldDoc.entities.push(lineC); // Removed in new

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 0, unchanged: 1 });
  });

  it('TEST 4: modified LINE (geometry changed, handle matches)', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    oldDoc.entities.push({
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    } as CadLineEntity);
    newDoc.entities.push({
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [150, 0, 0] }
    } as CadLineEntity);

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1, unchanged: 0 });
    const change = result.spaces.find(s => s.space === 'model')!.changes[0];
    expect(change.details?.matchMethod).toBe('HANDLE');
    expect(change.details?.geometryChanged).toBe(true);
  });

  it('TEST 5: floating point noise (should be unchanged)', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    oldDoc.entities.push({
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    } as CadLineEntity);
    newDoc.entities.push({
      id: 'L2', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0.000001, 0, 0], end: [100.000001, 0, 0] }
    } as CadLineEntity); // Notice handles are different!

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 1 });
  });

  it('TEST 6: duplicate geometry (deterministic 1:1 matching)', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    const line: CadLineEntity = {
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    };
    oldDoc.entities.push(line, {...line, id: 'L2'});
    newDoc.entities.push({...line, id: 'L3'}); // Only 1 in new

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 0, removed: 1, modified: 0, unchanged: 1 });
  });

  it('TEST 7: reversed LINE direction', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    oldDoc.entities.push({
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    } as CadLineEntity);
    newDoc.entities.push({
      id: 'L2', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [100, 0, 0], end: [0, 0, 0] }
    } as CadLineEntity); // Reversed

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 0, unchanged: 1 });
  });

  it('TEST 11: layer difference (same geometry)', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    oldDoc.entities.push({
      id: 'L1', type: 'LINE', layer: 'A-WALL', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    } as CadLineEntity);
    newDoc.entities.push({
      id: 'L2', type: 'LINE', layer: 'A-DOOR', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    } as CadLineEntity); // Diff handles, diff layer, same geometry

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1, unchanged: 0 });
    const change = result.spaces[0].changes[0];
    expect(change.details?.layerChanged).toBe(true);
    expect(change.details?.geometryChanged).toBe(false);
  });

  it('TEST 12: Modelspace/Layout isolation', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    oldDoc.entities.push({
      id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      geometry: { start: [0, 0, 0], end: [100, 0, 0] }
    } as CadLineEntity);
    
    newDoc.layouts['Layout1'] = {
      name: 'Layout1',
      entities: [{
        id: 'L2', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
        geometry: { start: [0, 0, 0], end: [100, 0, 0] }
      } as CadLineEntity]
    };

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 0, unchanged: 0 });
  });

  it('TEST 14: nested INSERT context (same block in diff spots)', () => {
    const oldDoc = createEmptyDoc();
    const newDoc = createEmptyDoc();
    
    const blockDef = {
      name: 'MyBlock',
      basePoint: [0,0,0] as [number,number,number],
      entities: [{
        id: 'L1', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
        geometry: { start: [0, 0, 0], end: [10, 0, 0] }
      } as CadLineEntity]
    };
    oldDoc.blocks['MyBlock'] = blockDef;
    newDoc.blocks['MyBlock'] = blockDef;

    oldDoc.entities.push({
      id: 'I1', type: 'INSERT', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      blockName: 'MyBlock', geometry: { insertionPoint: [100, 0, 0], rotation: 0, scale: [1,1,1] }
    } as CadInsertEntity);

    newDoc.entities.push({
      id: 'I2', type: 'INSERT', layer: '0', style: { color: 7, linetype: null, lineweight: null },
      blockName: 'MyBlock', geometry: { insertionPoint: [200, 0, 0], rotation: 0, scale: [1,1,1] }
    } as CadInsertEntity); // Completely different insert, handles differ, insert context differs

    const result = compareCadDocuments(oldDoc, newDoc);
    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 0, unchanged: 0 });
  });
});

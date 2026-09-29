import * as fs from 'fs';
import * as path from 'path';
import { compareCadDocuments } from './comparison/comparison/compare-documents';
import { normalizeDocument } from './comparison/normalization/normalize-document';
import type { ArcosCadDocument } from './types/cad-json';

function runAudit() {
  console.log('--- Phase 5.20.1 CAD Comparison Audit ---');
  const jsonPath = path.resolve(__dirname, 'dummy-json', 'cad.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Test JSON not found:', jsonPath);
    return;
  }
  
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const doc: ArcosCadDocument = raw.data ? raw.data : raw;
  const entityCount = doc.entities?.length || 0;
  console.log(`\nOriginal CAD Entity count (top level): ${entityCount}`);
  
  // 1. Profiling Normalization Separately
  console.log('\n--- Normalization Profiling ---');
  let t0 = performance.now();
  const oldNorm = normalizeDocument(doc);
  let t1 = performance.now();
  console.log(`OLD entity normalization time: ${(t1 - t0).toFixed(2)}ms`);
  
  t0 = performance.now();
  const newNorm = normalizeDocument(doc);
  t1 = performance.now();
  console.log(`NEW entity normalization time: ${(t1 - t0).toFixed(2)}ms`);

  let segmentCount = 0;
  for (const space of Object.values(oldNorm)) {
    segmentCount += space.length;
  }
  console.log(`Total normalized geometric segment count: ${segmentCount}`);

  // 2. Self Comparison
  console.log('\n--- Canonical vs Canonical (Self Test) ---');
  t0 = performance.now();
  const selfResult = compareCadDocuments(doc, doc);
  t1 = performance.now();
  console.log(`Total self-comparison time: ${(t1 - t0).toFixed(2)}ms`);
  console.log('Summary:', selfResult.summary);
  console.log('Stats:', (selfResult.summary as any).stats);

  // 3. Deterministic Duplicate Test
  console.log('\n--- Deterministic Duplicate Test ---');
  const dupDocOld = JSON.parse(JSON.stringify(doc));
  const dupDocNew = JSON.parse(JSON.stringify(doc));
  
  dupDocOld.entities = [];
  dupDocNew.entities = [];
  dupDocOld.blocks = {};
  dupDocNew.blocks = {};
  
  const sampleLine = {
    id: 'L', type: 'LINE', layer: '0', style: { color: 7, linetype: null, lineweight: null },
    geometry: { start: [0, 0, 0], end: [100, 0, 0] }
  };
  
  for(let i=0; i<100; i++) dupDocOld.entities.push({...sampleLine, id: `L${i}`});
  for(let i=0; i<102; i++) dupDocNew.entities.push({...sampleLine, id: `N${i}`});
  
  t0 = performance.now();
  const dupResult = compareCadDocuments(dupDocOld, dupDocNew);
  t1 = performance.now();
  console.log(`Duplicate test time: ${(t1 - t0).toFixed(2)}ms`);
  console.log('Duplicate summary (Expected: 100 unchanged, 2 added, 0 removed):', dupResult.summary);
  console.log('Duplicate stats:', (dupResult.summary as any).stats);

  // 4. Realistic Revision Test
  console.log('\n--- Realistic Revision Test ---');
  const newRevDoc = JSON.parse(JSON.stringify(doc));
  
  let modifiedCount = 0;
  let layerModCount = 0;
  let removedCount = 0;
  let addedCount = 0;
  
  const lines = newRevDoc.entities.filter((e: any) => e.type === 'LINE');
  if (lines.length >= 3) {
    // Modify geometry
    lines[0].geometry.end[0] += 50; 
    modifiedCount++;
    
    // Modify layer only
    lines[1].layer = 'NEW-LAYER';
    layerModCount++; // Expected MODIFIED (since same exact geometry but diff layer)
    
    // Remove one
    newRevDoc.entities = newRevDoc.entities.filter((e: any) => e.id !== lines[2].id);
    removedCount++;
  }
  
  // Add one
  newRevDoc.entities.push({
    id: 'NEW_LINE_1',
    type: 'LINE',
    layer: '0',
    style: { color: 7, linetype: null, lineweight: null },
    geometry: { start: [0, 0, 0], end: [100, 100, 0] }
  } as any);
  addedCount++;
  
  t0 = performance.now();
  const revResult = compareCadDocuments(doc, newRevDoc);
  t1 = performance.now();
  console.log(`Realistic revision time: ${(t1 - t0).toFixed(2)}ms`);
  console.log(`Expected: Added=${addedCount}, Removed=${removedCount}, Modified=${modifiedCount + layerModCount}`);
  console.log('Actual Summary:', revResult.summary);
  console.log('Stats:', (revResult.summary as any).stats);
  
  // Output a sample modified detail to verify struct
  const firstMod = revResult.spaces.flatMap(s => s.changes).find(c => c.changeType === 'MODIFIED');
  if (firstMod) {
    console.log('\nSample MODIFIED structure:', JSON.stringify(firstMod, null, 2));
  }
}

runAudit();

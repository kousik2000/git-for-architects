import * as fs from 'fs';
import * as path from 'path';
import { compareCadDocuments } from './comparison/comparison/compare-documents';
import type { ArcosCadDocument } from './types/cad-json';

function runValidation() {
  console.log('--- CAD Comparison Engine Validation ---');
  
  const jsonPath = path.resolve(__dirname, 'dummy-json', 'cad.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('Test JSON not found:', jsonPath);
    return;
  }
  
  console.log('Loading document...');
  const docText = fs.readFileSync(jsonPath, 'utf-8');
  let doc: ArcosCadDocument;
  try {
    const raw = JSON.parse(docText);
    doc = raw.data ? raw.data : raw; // Handle both ParseResponse and Document
  } catch (err) {
    console.error('Failed to parse JSON', err);
    return;
  }
  
  console.log(`Entities count: ${doc.entities?.length || 0}`);
  
  // Test 1: Self Comparison
  console.log('\nRunning self-comparison (Expected: 0 changes)...');
  const startSelf = Date.now();
  const selfResult = compareCadDocuments(doc, doc);
  const endSelf = Date.now();
  console.log(`Self comparison took ${endSelf - startSelf}ms`);
  console.log('Self summary:', selfResult.summary);
  
  // Test 2: Modified Comparison
  console.log('\nRunning modified comparison...');
  const newDoc: ArcosCadDocument = JSON.parse(JSON.stringify(doc));
  
  let modifiedCount = 0;
  let removedCount = 0;
  
  // Find lines to modify/remove
  const lines = newDoc.entities.filter((e: any) => e.type === 'LINE');
  if (lines.length >= 2) {
    // Modify the first line
    const l1 = lines[0] as any;
    l1.geometry.end[0] += 50; // shift end X
    modifiedCount++;
    
    // Remove the second line
    const l2 = lines[1];
    newDoc.entities = newDoc.entities.filter(e => e.id !== l2.id);
    removedCount++;
  }
  
  // Add a new line
  newDoc.entities.push({
    id: 'NEW_LINE_1',
    type: 'LINE',
    layer: '0',
    style: { color: 7, linetype: null, lineweight: null },
    geometry: { start: [0, 0, 0], end: [100, 100, 0] }
  } as any);
  const addedCount = 1;
  
  console.log(`Expected: Added=${addedCount}, Removed=${removedCount}, Modified=${modifiedCount}`);
  
  const startMod = Date.now();
  const modResult = compareCadDocuments(doc, newDoc);
  const endMod = Date.now();
  
  console.log(`Modified comparison took ${endMod - startMod}ms`);
  console.log('Modified summary:', modResult.summary);
  
  if (modResult.summary.added === addedCount &&
      modResult.summary.removed === removedCount &&
      modResult.summary.modified === modifiedCount) {
    console.log('\n✅ VALIDATION PASSED!');
  } else {
    console.error('\n❌ VALIDATION FAILED!');
  }
}

runValidation();

const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('../src/dummy-json/parsed_cad.json', 'utf-8'));
const data = raw.data || raw;
const entities = data.entities;

// 1. Entity distribution
const counts = {};
entities.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
const total = entities.length;
console.log('=== ENTITY DISTRIBUTION ===');
Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
  console.log(k + ': ' + v + '  (' + (v/total*100).toFixed(1) + '%)');
});
console.log('TOTAL: ' + total);

// 2. LINE verification
console.log('\n=== LINE VERIFICATION ===');
const lines = entities.filter(e => e.type === 'LINE');
let lineOk = 0, lineBad = 0, lineBadExamples = [];
lines.forEach(e => {
  const g = e.geometry;
  const ok = g && Array.isArray(g.start) && g.start.length >= 2 &&
             Array.isArray(g.end) && g.end.length >= 2 &&
             g.start.every(Number.isFinite) && g.end.every(Number.isFinite);
  if (ok) lineOk++; else { lineBad++; if(lineBadExamples.length < 3) lineBadExamples.push(e.id); }
});
console.log('Valid LINEs: ' + lineOk + '/' + lines.length);
console.log('Malformed LINEs: ' + lineBad + (lineBad > 0 ? ' IDs: ' + lineBadExamples.join(',') : ''));

// 3. LWPOLYLINE verification
console.log('\n=== LWPOLYLINE VERIFICATION ===');
const polys = entities.filter(e => e.type === 'LWPOLYLINE');
let polyOk = 0, polySkipped = 0, closedCount = 0, openCount = 0;
let totalVerts = 0, straightSegs = 0, bulgedSegs = 0;
let minVerts = Infinity, maxVerts = 0;
polys.forEach(e => {
  const g = e.geometry;
  if (!g || !Array.isArray(g.vertices) || g.vertices.length < 2) { polySkipped++; return; }
  polyOk++;
  if (g.closed) closedCount++; else openCount++;
  totalVerts += g.vertices.length;
  minVerts = Math.min(minVerts, g.vertices.length);
  maxVerts = Math.max(maxVerts, g.vertices.length);
  const numSeg = g.closed ? g.vertices.length : g.vertices.length - 1;
  for (let i = 0; i < numSeg; i++) {
    const v = g.vertices[i];
    const bulge = v[3] || 0;
    if (Math.abs(bulge) < 1e-6) straightSegs++; else bulgedSegs++;
  }
});
console.log('Total LWPOLYLINE: ' + polys.length);
console.log('  Will render (>=2 verts): ' + polyOk);
console.log('  Skipped (<2 verts): ' + polySkipped);
console.log('  Closed: ' + closedCount + '  Open: ' + openCount);
console.log('  Total vertices: ' + totalVerts + '  Min: ' + minVerts + '  Max: ' + maxVerts);
console.log('  Straight segments: ' + straightSegs + '  Bulged segments: ' + bulgedSegs);

// 4. TEXT verification
console.log('\n=== TEXT VERIFICATION ===');
const texts = entities.filter(e => e.type === 'TEXT');
let textOk = 0, textSkipped = 0, textMissingHeight = 0, textMissingRotation = 0, textMissingAlign = 0;
texts.forEach(e => {
  const hasText = !!e.text;
  const hasLoc = e.geometry && Array.isArray(e.geometry.location) && e.geometry.location.every(Number.isFinite);
  if (hasText && hasLoc) textOk++; else textSkipped++;
  if (e.geometry && !e.geometry.height) textMissingHeight++;
  if (e.geometry && !e.geometry.rotation && e.geometry.rotation !== 0) textMissingRotation++;
  if (e.geometry && !e.geometry.alignment) textMissingAlign++;
});
console.log('Total TEXT: ' + texts.length);
console.log('  Renderable (has text + location): ' + textOk);
console.log('  Skipped (missing text or location): ' + textSkipped);
console.log('  Missing height: ' + textMissingHeight + '/' + texts.length);
console.log('  Missing rotation: ' + textMissingRotation + '/' + texts.length);
console.log('  Missing alignment: ' + textMissingAlign + '/' + texts.length);
texts.forEach(t => {
  const loc = t.geometry && t.geometry.location ? t.geometry.location : 'MISSING';
  console.log('  [' + t.id + '] "' + t.text + '" @ ' + JSON.stringify(loc));
});

// 5. HATCH verification
console.log('\n=== HATCH VERIFICATION ===');
const hatches = entities.filter(e => e.type === 'HATCH');
const hatchKeys = new Set();
hatches.forEach(e => Object.keys(e.geometry || {}).forEach(k => hatchKeys.add(k)));
console.log('Total HATCH: ' + hatches.length);
console.log('Geometry keys present: ' + [...hatchKeys].join(', '));
const hasBoundary = hatches.some(e => e.geometry && (e.geometry.boundary_paths || e.geometry.paths || e.geometry.loops));
console.log('Has boundary/path geometry: ' + hasBoundary);
if (!hasBoundary) {
  console.log('VERDICT: HATCH cannot currently be rendered accurately from the existing JSON schema. Boundary path data is missing.');
}

// 6. INSERT verification
console.log('\n=== INSERT VERIFICATION ===');
const inserts = entities.filter(e => e.type === 'INSERT');
const insertKeys = new Set();
inserts.forEach(e => Object.keys(e.geometry || {}).forEach(k => insertKeys.add(k)));
const blockNames = [...new Set(inserts.map(e => e.blockName))];
const blocks = data.blocks || {};
const blockKeysList = Object.keys(blocks);
console.log('Total INSERT: ' + inserts.length);
console.log('INSERT geometry keys: ' + [...insertKeys].join(', '));
console.log('Referenced block names (first 5): ' + blockNames.slice(0,5).join(', '));
console.log('Block dict size: ' + blockKeysList.length);
const sampleBlock = blocks[blockKeysList[0]];
const blockDataKeys = sampleBlock ? Object.keys(sampleBlock) : [];
console.log('Block definition keys (sample): ' + blockDataKeys.join(', '));
const hasSubEntities = Object.values(blocks).some(b => b.entities && b.entities.length > 0);
console.log('Block definitions contain sub-entities: ' + hasSubEntities);
if (!hasSubEntities) {
  console.log('VERDICT: INSERT cannot currently be rendered accurately. Block geometry/sub-entities are not in the JSON schema.');
}

// Sample INSERT
const firstInsert = inserts[0];
if (firstInsert) {
  console.log('Sample INSERT geometry: ' + JSON.stringify(firstInsert.geometry));
  console.log('Sample INSERT blockName: ' + firstInsert.blockName);
}

// 7. Bounds verification
console.log('\n=== BOUNDS VERIFICATION ===');
const docBounds = data.bounds;
console.log('Doc bounds min: ' + JSON.stringify(docBounds.min));
console.log('Doc bounds max: ' + JSON.stringify(docBounds.max));
let calcMinX = Infinity, calcMinY = Infinity, calcMaxX = -Infinity, calcMaxY = -Infinity;
entities.filter(e => ['LINE','LWPOLYLINE','TEXT'].includes(e.type)).forEach(e => {
  const pts = [];
  if (e.type === 'LINE') { pts.push(e.geometry.start, e.geometry.end); }
  if (e.type === 'LWPOLYLINE') { (e.geometry.vertices||[]).forEach(v => pts.push(v)); }
  if (e.type === 'TEXT') { pts.push(e.geometry.location); }
  pts.forEach(p => {
    if (p[0] < calcMinX) calcMinX = p[0];
    if (p[1] < calcMinY) calcMinY = p[1];
    if (p[0] > calcMaxX) calcMaxX = p[0];
    if (p[1] > calcMaxY) calcMaxY = p[1];
  });
});
console.log('Calculated min (renderable entities): [' + calcMinX.toFixed(4) + ', ' + calcMinY.toFixed(4) + ']');
console.log('Calculated max (renderable entities): [' + calcMaxX.toFixed(4) + ', ' + calcMaxY.toFixed(4) + ']');
const docW = (docBounds.max[0]-docBounds.min[0]).toFixed(4);
const docH = (docBounds.max[1]-docBounds.min[1]).toFixed(4);
const geomW = (calcMaxX-calcMinX).toFixed(4);
const geomH = (calcMaxY-calcMinY).toFixed(4);
console.log('Doc bounds dimensions: ' + docW + ' x ' + docH);
console.log('Renderable geometry dimensions: ' + geomW + ' x ' + geomH);
const outside = calcMinX < docBounds.min[0] || calcMinY < docBounds.min[1] || calcMaxX > docBounds.max[0] || calcMaxY > docBounds.max[1];
console.log('Any renderable geometry outside doc bounds: ' + outside);
const docMaxYDelta = (docBounds.max[1]-calcMaxY).toFixed(4);
console.log('Doc bounds max Y delta vs geometry max Y: ' + docMaxYDelta + ' units above rendered geometry');

// 8. Summary coverage
console.log('\n=== RENDERING COVERAGE SUMMARY ===');
const rendered = lineOk + polyOk + textOk;
const unsupported = (hatches.length) + (inserts.length);
console.log('LINE:         ' + lineOk + '/' + lines.length + ' = ' + (lines.length > 0 ? (lineOk/lines.length*100).toFixed(1) : 'N/A') + '%');
console.log('LWPOLYLINE:   ' + polyOk + '/' + polys.length + ' = ' + (polys.length > 0 ? (polyOk/polys.length*100).toFixed(1) : 'N/A') + '%');
console.log('TEXT:         ' + textOk + '/' + texts.length + ' = ' + (texts.length > 0 ? (textOk/texts.length*100).toFixed(1) : 'N/A') + '%');
console.log('HATCH:        0/' + hatches.length + ' = 0% (schema insufficient)');
console.log('INSERT:       0/' + inserts.length + ' = 0% (schema insufficient)');
console.log('');
console.log('Total rendered:     ' + rendered + '/' + total + ' = ' + (rendered/total*100).toFixed(1) + '%');
console.log('Total unsupported:  ' + unsupported + '/' + total + ' = ' + (unsupported/total*100).toFixed(1) + '%');

const fs = require('fs');

const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
const entities = data.entities;

let totalEntities = entities.length;
let types = {};
let hatchEntities = [];

entities.forEach(e => {
    types[e.type] = (types[e.type] || 0) + 1;
    if (e.type === 'HATCH') hatchEntities.push(e);
});

console.log('--- ENTITY STATISTICS ---');
console.log('Total entities:', totalEntities);
console.log('Entity Types:', types);

let boundaryPaths = 0;
let polylinePaths = 0;
let edgePaths = 0;
let bulges = 0;
let disconnectedPathsCount = 0;

hatchEntities.forEach(h => {
    const paths = h.geometry.boundaryPaths || [];
    boundaryPaths += paths.length;
    
    if (paths.length > 1) disconnectedPathsCount++;
    
    paths.forEach(p => {
        if (p.type === 'PolylinePath') {
            polylinePaths++;
            p.vertices.forEach(v => {
                if (v.length > 2 && Math.abs(v[2]) > 1e-6) bulges++;
            });
        }
        if (p.type === 'EdgePath') {
            edgePaths++;
        }
    });
});

console.log('\n--- HATCH DIAGNOSTIC ---');
console.log('HATCH entities:', hatchEntities.length);
console.log('Boundary paths:', boundaryPaths);
console.log('Polyline paths:', polylinePaths);
console.log('Edge paths:', edgePaths);
console.log('Vertices with bulges:', bulges);
console.log('Disconnected contours (HATCH with >1 path):', disconnectedPathsCount);

console.log('\n--- STATISTICS VERIFICATION ---');
console.log(data.statistics);

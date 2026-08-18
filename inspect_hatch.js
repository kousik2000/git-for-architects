const fs = require('fs');
const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
const hatches = data.entities.filter(e => e.type === 'HATCH');

let totalHatches = hatches.length;
let totalPaths = 0;
let pathTypes = {};
let hasMultiPaths = 0;
let edgeTypes = {};
let allLineEdge = true;

for (const h of hatches) {
    const geo = h.geometry;
    const paths = geo.boundaryPaths || [];
    totalPaths += paths.length;
    if (paths.length > 1) hasMultiPaths++;
    for (const p of paths) {
        pathTypes[p.type] = (pathTypes[p.type] || 0) + 1;
        if (p.type === 'EdgePath' && p.edges) {
            for (const e of p.edges) {
                edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;
                if (e.type !== 'LineEdge') allLineEdge = false;
            }
        }
    }
}

console.log('--- HATCH Analysis ---');
console.log('Total HATCH entities:', totalHatches);
console.log('Total boundaryPaths:', totalPaths);
console.log('Hatches with >1 path:', hasMultiPaths);
console.log('Path types:', pathTypes);
console.log('Edge types:', edgeTypes);
console.log('Are all boundaries LineEdge? (if EdgePath)', allLineEdge);
if (hatches.length > 0) {
    console.log('Example HATCH:', JSON.stringify(hatches[0].geometry, null, 2));
}

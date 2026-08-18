const fs = require('fs');
const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
const blocks = data.blocks;

let cpCounts = {};
for (const [blockName, block] of Object.entries(blocks)) {
    if (!block.entities) continue;
    for (const e of block.entities) {
        if (e.type === 'SPLINE') {
            const count = e.geometry.controlPoints.length;
            cpCounts[count] = (cpCounts[count] || 0) + 1;
        }
    }
}

console.log('Control points per spline:', cpCounts);

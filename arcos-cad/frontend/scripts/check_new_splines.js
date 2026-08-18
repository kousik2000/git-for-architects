const fs = require('fs');

const data = JSON.parse(fs.readFileSync('../src/dummy-json/new_parsed_cad.json', 'utf8')).data;
const blocks = data.blocks;

let splines = [];
for (const [blockName, block] of Object.entries(blocks)) {
    if (!block.entities) continue;
    for (const e of block.entities) {
        if (e.type === 'SPLINE') {
            splines.push({ blockName, entity: e });
        }
    }
}

console.log(`Total SPLINEs found in new JSON blocks: ${splines.length}`);

if (splines.length > 0) {
    let degrees = {};
    let closedCount = 0;
    let knotsCount = {};
    let weightsCount = {};
    let rationalCount = 0;
    
    splines.forEach(s => {
        const g = s.entity.geometry || {};
        const degree = g.degree || 'undefined';
        degrees[degree] = (degrees[degree] || 0) + 1;
        
        if (g.closed) closedCount++;
        
        if (g.knots) {
            knotsCount[g.knots.length] = (knotsCount[g.knots.length] || 0) + 1;
        } else {
            knotsCount['none'] = (knotsCount['none'] || 0) + 1;
        }
        
        if (g.weights) {
            weightsCount[g.weights.length] = (weightsCount[g.weights.length] || 0) + 1;
        } else {
            weightsCount['none'] = (weightsCount['none'] || 0) + 1;
        }
        
        if (g.rational) rationalCount++;
    });

    console.log('\n--- NEW SPLINE PROPERTIES SUMMARY ---');
    console.log(`Degrees:`, degrees);
    console.log(`Closed: ${closedCount}`);
    console.log(`Knots:`, knotsCount);
    console.log(`Weights:`, weightsCount);
    console.log(`Rational: ${rationalCount}`);
    
    console.log('\n--- SAMPLE SPLINE #1 ---');
    console.log(JSON.stringify(splines[0].entity, null, 2));
}

console.log('\n--- STATS ---');
console.log(data.statistics);

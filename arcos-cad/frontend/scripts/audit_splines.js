const fs = require('fs');

const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
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

console.log(`Total SPLINEs found in blocks: ${splines.length}`);

if (splines.length > 0) {
    let degrees = {};
    let closedCount = 0;
    let withKnots = 0;
    let withWeights = 0;
    let withFitPoints = 0;
    let withControlPoints = 0;
    
    splines.forEach(s => {
        const g = s.entity.geometry || {};
        const degree = g.degree || 'undefined';
        degrees[degree] = (degrees[degree] || 0) + 1;
        
        if (g.closed) closedCount++;
        if (g.knots && g.knots.length > 0) withKnots++;
        if (g.weights && g.weights.length > 0) withWeights++;
        if (g.fitPoints && g.fitPoints.length > 0) withFitPoints++;
        if (g.controlPoints && g.controlPoints.length > 0) withControlPoints++;
    });

    console.log('\n--- SPLINE PROPERTIES SUMMARY ---');
    console.log(`Degrees:`, degrees);
    console.log(`Closed: ${closedCount}`);
    console.log(`Has Knots: ${withKnots}`);
    console.log(`Has Weights: ${withWeights}`);
    console.log(`Has Fit Points: ${withFitPoints}`);
    console.log(`Has Control Points: ${withControlPoints}`);
    
    console.log('\n--- SAMPLE SPLINE #1 ---');
    console.log(JSON.stringify(splines[0].entity, null, 2));
    
    if (splines.length > 1) {
        console.log('\n--- SAMPLE SPLINE #2 (Middle) ---');
        console.log(JSON.stringify(splines[Math.floor(splines.length/2)].entity, null, 2));
    }
}

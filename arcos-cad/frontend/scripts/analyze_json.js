const fs = require('fs');

function analyzeFile(filename) {
    console.log(`\n==================================================`);
    console.log(`ANALYSIS FOR: ${filename}`);
    console.log(`==================================================\n`);

    const raw = JSON.parse(fs.readFileSync(filename));
    const data = raw.data || raw;

    const entities = data.entities || [];
    
    // 1. Entity Counts
    const counts = { Total: entities.length, LINE: 0, LWPOLYLINE: 0, HATCH: 0, CIRCLE: 0, ARC: 0, POLYLINE: 0, INSERT: 0, TEXT: 0, MTEXT: 0, Other: 0 };
    
    entities.forEach(e => {
        if (counts[e.type] !== undefined) {
            counts[e.type]++;
        } else {
            counts.Other++;
        }
    });

    const rendered = counts.LINE + counts.LWPOLYLINE;
    const unsupported = counts.Total - rendered;

    console.log(`1. ENTITY COUNTS`);
    console.log(`Total entities: ${counts.Total}`);
    console.log(`Rendered entities: ${rendered}`);
    console.log(`  - LINE: ${counts.LINE}`);
    console.log(`  - LWPOLYLINE: ${counts.LWPOLYLINE}`);
    console.log(`Unsupported/not-rendered entities: ${unsupported}`);
    for (const [key, val] of Object.entries(counts)) {
        if (!['Total', 'LINE', 'LWPOLYLINE', 'Other'].includes(key) && val > 0) {
            console.log(`  - ${key}: ${val}`);
        }
    }
    if (counts.Other > 0) console.log(`  - Other: ${counts.Other}`);
    
    console.log(`\n==================================================`);
    // 2. Bounds Calculation
    let docBounds = data.bounds || { min: [0,0,0], max: [0,0,0] };
    console.log(`2. DOCUMENT BOUNDS (from JSON):`);
    console.log(`minX: ${docBounds.min[0]}, minY: ${docBounds.min[1]}`);
    console.log(`maxX: ${docBounds.max[0]}, maxY: ${docBounds.max[1]}`);

    function getPoints(entity) {
        let pts = [];
        if (!entity.geometry) return pts;
        
        if (entity.type === 'LINE') {
            if (entity.geometry.start) pts.push(entity.geometry.start);
            if (entity.geometry.end) pts.push(entity.geometry.end);
        } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            if (entity.geometry.vertices) {
                entity.geometry.vertices.forEach(v => pts.push([v[0], v[1], v[2] || 0]));
            }
        } else if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
            if (entity.geometry.center) pts.push(entity.geometry.center);
        } else if (entity.type === 'INSERT') {
            if (entity.geometry.insert) pts.push(entity.geometry.insert);
        }
        return pts;
    }

    let allMin = [Infinity, Infinity], allMax = [-Infinity, -Infinity];
    let lineMin = [Infinity, Infinity], lineMax = [-Infinity, -Infinity];
    let lwMin = [Infinity, Infinity], lwMax = [-Infinity, -Infinity];
    
    entities.forEach(e => {
        const pts = getPoints(e);
        pts.forEach(p => {
            // all
            if (p[0] < allMin[0]) allMin[0] = p[0];
            if (p[1] < allMin[1]) allMin[1] = p[1];
            if (p[0] > allMax[0]) allMax[0] = p[0];
            if (p[1] > allMax[1]) allMax[1] = p[1];
            
            // line
            if (e.type === 'LINE') {
                if (p[0] < lineMin[0]) lineMin[0] = p[0];
                if (p[1] < lineMin[1]) lineMin[1] = p[1];
                if (p[0] > lineMax[0]) lineMax[0] = p[0];
                if (p[1] > lineMax[1]) lineMax[1] = p[1];
            }
            
            // lwpolyline
            if (e.type === 'LWPOLYLINE') {
                if (p[0] < lwMin[0]) lwMin[0] = p[0];
                if (p[1] < lwMin[1]) lwMin[1] = p[1];
                if (p[0] > lwMax[0]) lwMax[0] = p[0];
                if (p[1] > lwMax[1]) lwMax[1] = p[1];
            }
        });
    });

    console.log(`\nCALCULATED BOUNDS (All entities with points):`);
    console.log(`minX: ${allMin[0]}, minY: ${allMin[1]}`);
    console.log(`maxX: ${allMax[0]}, maxY: ${allMax[1]}`);

    console.log(`\nCALCULATED BOUNDS (LINE only):`);
    console.log(`minX: ${lineMin[0]}, minY: ${lineMin[1]}`);
    console.log(`maxX: ${lineMax[0]}, maxY: ${lineMax[1]}`);

    console.log(`\nCALCULATED BOUNDS (LWPOLYLINE only):`);
    console.log(`minX: ${lwMin[0]}, minY: ${lwMin[1]}`);
    console.log(`maxX: ${lwMax[0]}, maxY: ${lwMax[1]}`);

    console.log(`\n==================================================`);
    console.log(`3. GEOMETRY vs DOCUMENT BOUNDS`);
    
    let insideBounds = 0;
    let outsideBounds = 0;
    let outsideExamples = [];
    
    entities.forEach(e => {
        if (e.type !== 'LINE' && e.type !== 'LWPOLYLINE') return;
        
        const pts = getPoints(e);
        let isInside = true;
        let oExample = null;
        
        pts.forEach(p => {
            if (p[0] < docBounds.min[0] || p[0] > docBounds.max[0] ||
                p[1] < docBounds.min[1] || p[1] > docBounds.max[1]) {
                isInside = false;
                oExample = p;
            }
        });
        
        if (isInside) {
            insideBounds++;
        } else {
            outsideBounds++;
            if (outsideExamples.length < 5) {
                outsideExamples.push({ id: e.id, type: e.type, pt: oExample });
            }
        }
    });

    console.log(`Entities strictly inside document bounds: ${insideBounds}`);
    console.log(`Entities outside document bounds: ${outsideBounds}`);
    if (outsideBounds > 0) {
        console.log(`Examples of outside points:`);
        outsideExamples.forEach(ex => console.log(`  ${ex.type} (${ex.id}) point at [${ex.pt[0]}, ${ex.pt[1]}]`));
    }

    console.log(`\n==================================================`);
    console.log(`4. EXTREME COORDINATES`);
    console.log(`Drawing width: ${allMax[0] - allMin[0]}`);
    console.log(`Drawing height: ${allMax[1] - allMin[1]}`);
    
    // Check for outliers by looking at the standard deviation or comparing document bounds vs calculated bounds
    console.log(`Difference between document max X and calculated max X: ${allMax[0] - docBounds.max[0]}`);
    console.log(`Difference between document max Y and calculated max Y: ${allMax[1] - docBounds.max[1]}`);
    console.log(`Difference between document min X and calculated min X: ${docBounds.min[0] - allMin[0]}`);
    console.log(`Difference between document min Y and calculated min Y: ${docBounds.min[1] - allMin[1]}`);
    
    if (allMax[0] > docBounds.max[0] || allMax[1] > docBounds.max[1] || allMin[0] < docBounds.min[0] || allMin[1] < docBounds.min[1]) {
        console.log(`Outlier geometry detected outside document bounds.`);
    } else {
        console.log(`No extreme outliers far outside document bounds detected.`);
    }

}

analyzeFile('F2841747_parsed.json');
analyzeFile('parsed_cad.json');

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('../src/dummy-json/new_parsed_cad.json', 'utf8')).data;
const blocks = data.blocks;

let allBezierEquivalent = true;
let nonBezierKnots = [];

for (const block of Object.values(blocks)) {
    if (!block.entities) continue;
    for (const e of block.entities) {
        if (e.type === 'SPLINE') {
            const k = e.geometry.knots;
            if (!k || k.length !== 8) {
                allBezierEquivalent = false;
                continue;
            }
            // Check if knots are [a, a, a, a, b, b, b, b]
            const isBezierKnot = 
                k[0] === k[1] && k[1] === k[2] && k[2] === k[3] &&
                k[4] === k[5] && k[5] === k[6] && k[6] === k[7] &&
                k[0] !== k[4];
                
            if (!isBezierKnot) {
                allBezierEquivalent = false;
                nonBezierKnots.push(k);
            }
        }
    }
}

console.log(`All 208 SPLINEs mathematically equivalent to cubic Bezier? ${allBezierEquivalent}`);
if (!allBezierEquivalent) {
    console.log(`Some non-Bezier knots:`, nonBezierKnots.slice(0, 5));
}

const stats = fs.statSync('../src/dummy-json/new_parsed_cad.json');
console.log(`New JSON size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

const fs = require('fs');

const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
const blocks = data.blocks;
const entities = data.entities;

// Find which blocks are referenced by modelspace INSERTs
const referencedBlocks = new Set();
entities.filter(e => e.type === 'INSERT').forEach(e => {
    referencedBlocks.add(e.blockName);
});

// Analyze block entities
let totalBlockEntities = 0;
let entityDistribution = {};
let nestedInserts = 0;
let maxDepth = 0;

function analyzeBlock(blockName, depth) {
    if (depth > maxDepth) maxDepth = depth;
    if (depth > 100) return; // Prevent infinite recursion in analysis just in case
    
    // In the phase 5.5 output, `blocks` is a dictionary keyed by name
    const block = blocks[blockName];
    if (!block || !block.entities) return;

    // We only want to count each block's definition entities ONCE for the global "definition" statistics,
    // but the prompt says: "Analyze all referenced block definitions and produce an exact entity distribution report."
    // Let's do it for all block definitions present in `data.blocks` since Phase 5.5 already filtered unused blocks.
}

// Since Phase 5.5 blocks dict is already filtered, we just loop through it once
for (const [blockName, block] of Object.entries(blocks)) {
    if (!block.entities) continue;
    
    totalBlockEntities += block.entities.length;
    
    for (const e of block.entities) {
        entityDistribution[e.type] = (entityDistribution[e.type] || 0) + 1;
        if (e.type === 'INSERT') {
            nestedInserts++;
        }
    }
}

// Determine max nesting depth by tracing modelspace INSERTs down
function traceDepth(blockName, currentDepth, visited) {
    if (visited.has(blockName)) return currentDepth; // Circular
    
    const block = blocks[blockName];
    if (!block || !block.entities) return currentDepth;
    
    let localMax = currentDepth;
    const nextVisited = new Set(visited);
    nextVisited.add(blockName);
    
    const inserts = block.entities.filter(e => e.type === 'INSERT');
    for (const ins of inserts) {
        const d = traceDepth(ins.blockName, currentDepth + 1, nextVisited);
        if (d > localMax) localMax = d;
    }
    
    return localMax;
}

let maxNestingDepth = 0;
for (const blockName of referencedBlocks) {
    const d = traceDepth(blockName, 1, new Set());
    if (d > maxNestingDepth) maxNestingDepth = d;
}

console.log('--- BLOCK ANALYSIS ---');
console.log('Referenced block definitions:', Object.keys(blocks).length);
console.log('Total block entities:', totalBlockEntities);
console.log('Entity distribution:', entityDistribution);
console.log('Nested INSERTs count:', nestedInserts);
console.log('Maximum nesting depth:', maxNestingDepth);

const supportedTypes = ['LINE', 'LWPOLYLINE', 'TEXT', 'HATCH'];
console.log('Supported by current renderer:', supportedTypes);
const unsupportedTypes = Object.keys(entityDistribution).filter(t => !supportedTypes.includes(t) && t !== 'INSERT');
console.log('Require future phases:', unsupportedTypes);

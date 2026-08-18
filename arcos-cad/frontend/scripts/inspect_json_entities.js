const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('../src/dummy-json/parsed_cad.json', 'utf-8'));
const entities = raw.data ? raw.data.entities : raw.entities;

const typesToFind = ['HATCH', 'INSERT', 'TEXT', 'CIRCLE', 'ARC'];
const examples = {};

entities.forEach(e => {
    if (typesToFind.includes(e.type) && !examples[e.type]) {
        examples[e.type] = e;
    }
});

console.log(JSON.stringify(examples, null, 2));

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
console.log("type of blocks:", Array.isArray(data.blocks) ? "Array" : "Object");
const keys = Object.keys(data.blocks);
if (keys.length > 0) {
    const b = data.blocks[keys[0]];
    console.log("First block keys:", Object.keys(b));
    console.log("Has entities?", Array.isArray(b.entities));
}

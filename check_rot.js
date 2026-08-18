const fs = require('fs');
const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
const inserts = data.entities.filter(e => e.type === 'INSERT');
for (const ins of inserts) {
    if (ins.geometry.rotation !== 0) {
        console.log('Found rotation:', ins.geometry.rotation);
    }
}

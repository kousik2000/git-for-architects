const fs = require('fs');
const data = JSON.parse(fs.readFileSync('parsed_cad_phase5_5.json', 'utf8')).data;
const inserts = data.entities.filter(e => e.type === 'INSERT');
if(inserts.length > 0) {
    console.log(JSON.stringify(inserts[0], null, 2));
}

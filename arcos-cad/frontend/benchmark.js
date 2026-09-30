const fs = require('fs');
const path = require('path');
const tsNode = require('ts-node');

tsNode.register({
  compilerOptions: { module: 'commonjs', esModuleInterop: true, skipLibCheck: true }
});

const { normalizeDocument } = require('./src/comparison/normalization/normalize-document.ts');
const { matchEntities } = require('./src/comparison/matching/entity-matcher.ts');

async function runTest() {
  const oldPath = path.join('..', 'F2841747_django_test.dxf');
  const newPath = path.join('..', 'F2841747.dxf');
  
  if (!fs.existsSync(oldPath)) {
     console.log('File not found: ' + oldPath);
     return;
  }
  
  // Actually, I don't have the parsed JSON. The DXF parser is needed.
  // We can just parse it using cadApi? No, the backend does the parsing.
  console.log("Since we don't have the parsed JSON, we'll simulate the load if possible.");
}
runTest();

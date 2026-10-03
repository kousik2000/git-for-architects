import { CadRenderer } from './cad/renderer/CadRenderer';
import { parseCadDocument } from './types/cad-json';
import * as fs from 'fs';

// Mock container
const container = document.createElement('div');
const renderer = new CadRenderer(container);

// Load the old drawing
const data = JSON.parse(fs.readFileSync('../../samples/test_drawing.json', 'utf8')); // Wait, I don't know the exact path. I'll just check if renderer compiles.

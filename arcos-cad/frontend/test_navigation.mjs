import { strict as assert } from 'assert';

console.log('Running mathematical tests for ComparisonNavigationController...');

// Mock state
const oldState = {
  cameraX: 1000,
  cameraY: 500,
  unitsPerPixel: 0.5,
  space: 'model'
};

// If old applies this state to new...
let newCameraX = 0;
let newCameraY = 0;
let newZoom = 1;

// Simulate target having a completely different baseUnitsPerPixel (e.g. much larger bounds)
const newBaseUnitsPerPixel = 100;

function setNavigationState(state) {
  if (state.unitsPerPixel <= 0) return;
  newCameraX = state.cameraX;
  newCameraY = state.cameraY;
  
  if (newBaseUnitsPerPixel > 0) {
    newZoom = newBaseUnitsPerPixel / state.unitsPerPixel;
  }
}

setNavigationState(oldState);

// Verifications
assert.equal(newCameraX, 1000, 'cameraX should be exactly equal');
assert.equal(newCameraY, 500, 'cameraY should be exactly equal');
// newZoom should be 100 / 0.5 = 200
assert.equal(newZoom, 200, 'Zoom should be calculated correctly');

// Validate reverse mapping (if NEW reports its state)
const newState = {
  cameraX: newCameraX,
  cameraY: newCameraY,
  unitsPerPixel: newBaseUnitsPerPixel / newZoom,
  space: 'model'
};

assert.equal(newState.unitsPerPixel, 0.5, 'unitsPerPixel should remain mathematically stable');

console.log('All mathematical tests passed successfully!');

/**
 * PHASE 5.16C-D — VIEWPORT FROZEN LAYERS UNIT TESTS
 *
 * Tests the correctness of the viewport-specific frozen layer isolation logic.
 *
 * Validates:
 *   A. Global visible + viewport not frozen -> visible
 *   B. Global visible + viewport frozen -> hidden
 *   C. Global hidden + viewport not frozen -> hidden
 *   D. Global hidden + viewport frozen -> hidden
 *   E. Same layer: Viewport A frozen, Viewport B visible
 *
 * Run: npx ts-node src/cad/renderer/__tests__/frozen-layers.test.ts
 */

import * as THREE from 'three';

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✓  ${name}`); passed++; }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗  ${name}\n     ${msg}`);
    failed++;
  }
}

function assertEqual(a: any, b: any, label: string) {
  if (a !== b) {
    throw new Error(`FAIL [${label}]: expected ${b}, got ${a}`);
  }
}

console.log('\n=== PHASE 5.16C-D: Viewport Frozen Layers Unit Tests ===\n');

// Mock structure similar to CadRenderer
const createRendererMock = () => {
  const modelSpaceGroup = new THREE.Group();
  
  const layerWalls = new THREE.Group();
  layerWalls.name = 'layer_WALLS';
  layerWalls.visible = true; // globally visible
  
  const layerDoors = new THREE.Group();
  layerDoors.name = 'layer_DOORS';
  layerDoors.visible = false; // globally hidden
  
  modelSpaceGroup.add(layerWalls, layerDoors);

  const renderViewport = (vp: { frozenLayers: string[] }) => {
    // 1. Hide frozen layers
    const hiddenGroups: THREE.Group[] = [];
    if (vp.frozenLayers && vp.frozenLayers.length > 0) {
      for (const layerName of vp.frozenLayers) {
        const msGroup = modelSpaceGroup.children.find(c => c.name === `layer_${layerName}`) as THREE.Group;
        if (msGroup && msGroup.visible) {
          msGroup.visible = false;
          hiddenGroups.push(msGroup);
        }
      }
    }
    
    // 2. Capture state during render
    const renderedState = {
      WALLS: layerWalls.visible,
      DOORS: layerDoors.visible
    };
    
    // 3. Restore hidden layers
    for (const msGroup of hiddenGroups) {
      msGroup.visible = true;
    }
    
    return renderedState;
  };
  
  return { modelSpaceGroup, layerWalls, layerDoors, renderViewport };
};

test('A/B/C/D: Global vs Viewport frozen logic', () => {
  const mock = createRendererMock();
  
  // Viewport A: WALLS is frozen
  const vpA = { frozenLayers: ['WALLS'] };
  const resA = mock.renderViewport(vpA);
  
  assertEqual(resA.WALLS, false, 'WALLS should be hidden in VP A (frozen)');
  assertEqual(resA.DOORS, false, 'DOORS should be hidden in VP A (globally hidden)');
  
  // Viewport B: Nothing frozen
  const vpB = { frozenLayers: [] };
  const resB = mock.renderViewport(vpB);
  
  assertEqual(resB.WALLS, true, 'WALLS should be visible in VP B (not frozen)');
  assertEqual(resB.DOORS, false, 'DOORS should be hidden in VP B (globally hidden)');
  
  // Viewport C: DOORS is frozen (but already globally hidden)
  const vpC = { frozenLayers: ['DOORS'] };
  const resC = mock.renderViewport(vpC);
  
  assertEqual(resC.WALLS, true, 'WALLS should be visible in VP C');
  assertEqual(resC.DOORS, false, 'DOORS should remain hidden in VP C');
  
  // Ensure global state wasn't permanently mutated
  assertEqual(mock.layerWalls.visible, true, 'Global WALLS should remain visible');
  assertEqual(mock.layerDoors.visible, false, 'Global DOORS should remain hidden');
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error('\n❌ UNIT TESTS FAILED'); process.exit(1); }
else             { console.log('\n✅ ALL UNIT TESTS PASSED'); }

export {};

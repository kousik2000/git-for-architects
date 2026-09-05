/**
 * PHASE 5.16C-B — VIEWPORT TWIST MATHEMATICAL UNIT TEST
 *
 * Tests the correctness of the twist transformation INDEPENDENTLY of the renderer.
 * Validates:
 *   1. Rotation pivots around viewCenter (not global origin, not vpCenter)
 *   2. Sign convention: DXF positive twist = Three.js negative rotation.z
 *   3. Zero twist produces identical results to 5.16B
 *   4. Full pipeline: T(vpCenter) × S(scale) × R(-twist) × T(-viewCenter)
 *
 * Run: npx ts-node src/cad/renderer/__tests__/twist.test.ts
 * Or add to jest/vitest suite.
 */

// ─── Pure math helpers (no Three.js dependency) ────────────────────────────

/** Rotate a 2D point around the origin by angle (radians, CCW positive). */
function rotate2D(x: number, y: number, angleCCW: number): [number, number] {
  const cos = Math.cos(angleCCW);
  const sin = Math.sin(angleCCW);
  return [cos * x - sin * y, sin * x + cos * y];
}

/**
 * Full viewport transform:
 *   T(vpCenter) × S(scale) × R(-twist) × T(-viewCenter) × P
 *
 * where -twist negates DXF convention (view rotation → geometry rotation is inverted).
 *
 * Steps:
 *   1. Translate P by -viewCenter  → shift geometry to rotation origin
 *   2. Rotate by -twist (CW in DXF → CW rotation of geometry = CCW of coords)
 *   3. Scale by viewport scale
 *   4. Translate to vpCenter
 */
function applyViewportTransform(
  px: number,
  py: number,
  viewCenterX: number,
  viewCenterY: number,
  vpCenterX: number,
  vpCenterY: number,
  scale: number,
  twistDxfRad: number   // DXF convention: positive = CCW view twist
): { x: number; y: number; steps: Record<string, [number, number]> } {
  // Step 1: T(-viewCenter) — translate to rotation pivot
  const tx = px - viewCenterX;
  const ty = py - viewCenterY;

  // Step 2: R(-twist) — negate because rotating VIEW CCW ≡ rotating GEOMETRY CW
  const [rx, ry] = rotate2D(tx, ty, -twistDxfRad);

  // Step 3: S(scale)
  const sx = rx * scale;
  const sy = ry * scale;

  // Step 4: T(vpCenter)
  const finalX = vpCenterX + sx;
  const finalY = vpCenterY + sy;

  return {
    x: finalX,
    y: finalY,
    steps: {
      'after T(-viewCenter)': [tx, ty],
      'after R(-twist)':      [rx, ry],
      'after S(scale)':       [sx, sy],
      'after T(vpCenter)':    [finalX, finalY],
    }
  };
}

const EPSILON = 1e-9;
function assertClose(a: number, b: number, label: string, tol = 1e-6): void {
  if (Math.abs(a - b) > tol) {
    throw new Error(`FAIL [${label}]: expected ${b.toFixed(10)}, got ${a.toFixed(10)}, diff=${Math.abs(a-b)}`);
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`  ✗  ${name}`);
    console.error(`     ${msg}`);
    failed++;
  }
}

console.log('\n=== PHASE 5.16C-B: Viewport Twist Unit Tests ===\n');

// ── Test 1: Zero twist produces 5.16B-equivalent result ─────────────────────
test('Zero twist: point (110,100), viewCenter=(100,100), vpCenter=(500,500), scale=1', () => {
  const result = applyViewportTransform(110, 100, 100, 100, 500, 500, 1, 0);
  // Expected: vpCenter + scale*(point - viewCenter) = 500+(110-100), 500+(100-100) = (510, 500)
  assertClose(result.x, 510, 'x');
  assertClose(result.y, 500, 'y');
});

// ── Test 2: 90° twist pivots around viewCenter, NOT global origin ────────────
test('90° twist (π/2): point (110,100), viewCenter=(100,100), vpCenter=(500,500), scale=1', () => {
  //  1. Translate: (110-100, 100-100) = (10, 0)
  //  2. Rotate -π/2 (CW): R(-90°)(10,0) = (0, -10)   [cos(-90)=0, sin(-90)=-1 → (0·10-(-1)·0, (-1)·10+0·0) = (0,-10)]
  //  3. Scale ×1: (0, -10)
  //  4. Translate to vpCenter: (500+0, 500-10) = (500, 490)
  const result = applyViewportTransform(110, 100, 100, 100, 500, 500, 1, Math.PI / 2);
  console.log('    Steps:', result.steps);
  assertClose(result.x, 500, 'x');
  assertClose(result.y, 490, 'y');
});

// ── Test 3: Rotation pivot is viewCenter, not global origin ─────────────────
test('Pivot verification: point (110,100), twist=π/2, wrong pivot would give wrong answer', () => {
  // If pivot were (0,0):  R(-π/2)(110,100) = (100, -110) + vpCenter = (600, 390)  [WRONG]
  // If pivot were vpCenter: shift (110-500,100-500)=(-390,-400), R(-π/2)(-390,-400)=(-400,390), +vpCenter=(100,890) [WRONG]
  // Correct pivot = viewCenter=(100,100):  gives (500, 490) as above
  const result = applyViewportTransform(110, 100, 100, 100, 500, 500, 1, Math.PI / 2);
  // Verify it's NOT the wrong-pivot results
  const pivotWrong_global_x = Math.cos(-Math.PI/2)*110 - Math.sin(-Math.PI/2)*100 + 500;
  const pivotWrong_global_y = Math.sin(-Math.PI/2)*110 + Math.cos(-Math.PI/2)*100 + 500;
  if (Math.abs(result.x - pivotWrong_global_x) < 1e-6 && Math.abs(result.y - pivotWrong_global_y) < 1e-6) {
    throw new Error('Result matches WRONG global-origin pivot — pivot is incorrect!');
  }
  // Must match correct pivot=(100,100) giving (500, 490)
  assertClose(result.x, 500, 'x=500');
  assertClose(result.y, 490, 'y=490');
});

// ── Test 4: Scale with twist ─────────────────────────────────────────────────
test('90° twist with scale=2: point (110,100), viewCenter=(100,100), vpCenter=(500,500)', () => {
  //  1. Translate: (10, 0)
  //  2. R(-π/2): (0, -10)
  //  3. Scale ×2: (0, -20)
  //  4. +vpCenter: (500, 480)
  const result = applyViewportTransform(110, 100, 100, 100, 500, 500, 2, Math.PI / 2);
  assertClose(result.x, 500, 'x');
  assertClose(result.y, 480, 'y');
});

// ── Test 5: 180° twist ────────────────────────────────────────────────────────
test('180° twist (π): point (110,100), viewCenter=(100,100), vpCenter=(500,500), scale=1', () => {
  //  1. Translate: (10, 0)
  //  2. R(-π): (-10, 0)  [cos(-π)=-1, sin(-π)=0]
  //  3. Scale ×1: (-10, 0)
  //  4. +vpCenter: (490, 500)
  const result = applyViewportTransform(110, 100, 100, 100, 500, 500, 1, Math.PI);
  assertClose(result.x, 490, 'x', 1e-5);
  assertClose(result.y, 500, 'y', 1e-5);
});

// ── Test 6: Negative twist (CW DXF = CCW geometry) ───────────────────────────
test('-90° twist (-π/2): point (110,100), viewCenter=(100,100), vpCenter=(500,500), scale=1', () => {
  //  1. Translate: (10, 0)
  //  2. R(+π/2) (CCW, since we negate): (0, 10)  [cos(π/2)=0, sin(π/2)=1]
  //  3. Scale ×1: (0, 10)
  //  4. +vpCenter: (500, 510)
  const result = applyViewportTransform(110, 100, 100, 100, 500, 500, 1, -Math.PI / 2);
  assertClose(result.x, 500, 'x');
  assertClose(result.y, 510, 'y');
});

// ── Test 7: Point AT viewCenter always maps to vpCenter ─────────────────────
test('Point at viewCenter always maps to vpCenter (any twist)', () => {
  for (const twist of [0, Math.PI/4, Math.PI/2, Math.PI, -Math.PI/3, 2.7]) {
    const result = applyViewportTransform(100, 100, 100, 100, 500, 500, 1, twist);
    assertClose(result.x, 500, `x for twist=${twist}`);
    assertClose(result.y, 500, `y for twist=${twist}`);
  }
});

// ── Test 8: Real DXF twist=0 viewports produce 5.16B-identical results ──────
test('twist=0 with realistic DXF values (TERMINALDESIGN handle=11BD6 sample)', () => {
  // From forensic: vpCenter≈(5.67, 9.54), viewCenter≈(5.30, 10.25), scale≈vH/viewH
  // Values approximate for unit-test purposes:
  const vpCenterX = 5.67, vpCenterY = 9.54;
  const vcX = 5.30, vcY = 10.25;
  const scale = 0.0122;
  const twist = 0;
  const pX = 100, pY = 200; // arbitrary modelspace point

  const withTwist    = applyViewportTransform(pX, pY, vcX, vcY, vpCenterX, vpCenterY, scale, twist);
  // 5.16B formula: vpCenter + scale*(P - viewCenter)
  const legacy_x = vpCenterX + scale * (pX - vcX);
  const legacy_y = vpCenterY + scale * (pY - vcY);

  assertClose(withTwist.x, legacy_x, 'x matches 5.16B');
  assertClose(withTwist.y, legacy_y, 'y matches 5.16B');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\n❌ UNIT TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n✅ ALL UNIT TESTS PASSED');
}

export {};

/**
 * PHASE 5.16C-C — VIEW DIRECTION PROJECTION UNIT TESTS
 *
 * Tests the correctness of the view basis calculation and projection
 * INDEPENDENTLY of the Three.js renderer.
 *
 * Validates:
 *   A. Top-view (0,0,1): identical to 5.16B result
 *   B. Front-view (0,1,0): correct X/Z projection onto screen
 *   C. Side-view (1,0,0): correct Y/Z projection onto screen
 *   D. Arbitrary normalized direction (1,1,1)/sqrt(3): orthonormal basis
 *   E. Point at viewCenter always maps to vpCenter (any direction)
 *   F. Non-unit viewDirection normalized: (10,0,0) same as (1,0,0)
 *   G. Basis orthonormality assertions
 *   H. Twist + non-Z interaction
 *
 * Run: npx ts-node src/cad/renderer/__tests__/viewdir.test.ts
 */

// ─── Pure math helpers (no Three.js dependency) ────────────────────────────

interface Vec3 { x: number; y: number; z: number; }
interface Vec2 { x: number; y: number; }

function normalize3(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
  if (len < 1e-10) return { x: 0, y: 0, z: 1 };
  return { x: v.x/len, y: v.y/len, z: v.z/len };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x*b.x + a.y*b.y + a.z*b.z;
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y*b.z - a.z*b.y,
    y: a.z*b.x - a.x*b.z,
    z: a.x*b.y - a.y*b.x,
  };
}

/**
 * Compute the orthonormal view basis (right, up, forward) from a viewDirection.
 * This is the pure-math equivalent of computeViewBasisQuaternion in CadRenderer.ts.
 */
function computeViewBasis(dx: number, dy: number, dz: number): {
  forward: Vec3; right: Vec3; up: Vec3;
} {
  const forward = normalize3({ x: dx, y: dy, z: dz });

  // Reference-up: default Y, fallback X if nearly parallel
  let refUp: Vec3 = { x: 0, y: 1, z: 0 };
  if (Math.abs(forward.y) > 0.999) {
    refUp = { x: 1, y: 0, z: 0 };
  }

  // right = normalize(refUp × forward)
  const right = normalize3(cross3(refUp, forward));
  // up    = normalize(forward × right)
  const up    = normalize3(cross3(forward, right));

  return { forward, right, up };
}

/**
 * Full viewport projection:
 *   1. V = P - viewCenter
 *   2. screenX = dot(V, right),  screenY = dot(V, up)
 *   3. Apply twist: rotate (screenX, screenY) by -twist
 *   4. Scale and translate to PaperSpace
 */
function projectPoint(
  px: number, py: number, pz: number,
  viewCenter: [number, number, number],
  vpCenter: [number, number],
  scale: number,
  twistRad: number,
  viewDirX: number, viewDirY: number, viewDirZ: number
): Vec2 {
  const V: Vec3 = {
    x: px - viewCenter[0],
    y: py - viewCenter[1],
    z: pz - viewCenter[2],
  };

  const { right, up } = computeViewBasis(viewDirX, viewDirY, viewDirZ);

  let sx = dot3(V, right);
  let sy = dot3(V, up);

  // Apply twist (negate DXF sign: view CCW → geometry CW)
  if (Math.abs(twistRad) > 1e-10) {
    const cos = Math.cos(-twistRad);
    const sin = Math.sin(-twistRad);
    const tx = cos * sx - sin * sy;
    const ty = sin * sx + cos * sy;
    sx = tx; sy = ty;
  }

  return {
    x: vpCenter[0] + sx * scale,
    y: vpCenter[1] + sy * scale,
  };
}

const EPSILON = 1e-6;
function assertClose(a: number, b: number, label: string, tol = EPSILON): void {
  if (Math.abs(a - b) > tol) {
    throw new Error(`FAIL [${label}]: expected ${b.toFixed(10)}, got ${a.toFixed(10)}, diff=${(a-b).toFixed(2e-10)}}`);
  }
}
function assertNear(a: number, b: number, label: string): void {
  assertClose(a, b, label, 1e-5);
}

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

console.log('\n=== PHASE 5.16C-C: ViewDirection Projection Unit Tests ===\n');

// ─── SECTION A: Top-view (0,0,1) — must match 5.16B exactly ────────────────
console.log('--- A. Top-view (0,0,1): must equal 5.16B ---');

test('A1: Z-view, point (110,100,0) → (510,500) — matches 5.16B legacy', () => {
  const r = projectPoint(110,100,0, [100,100,0], [500,500], 1, 0, 0,0,1);
  assertNear(r.x, 510, 'x'); assertNear(r.y, 500, 'y');
});

test('A2: Z-view, point at viewCenter → vpCenter', () => {
  const r = projectPoint(100,100,0, [100,100,0], [500,500], 1, 0, 0,0,1);
  assertNear(r.x, 500, 'x'); assertNear(r.y, 500, 'y');
});

test('A3: Z-view, scale=2, point (110,100,0) → (520,500)', () => {
  const r = projectPoint(110,100,0, [100,100,0], [500,500], 2, 0, 0,0,1);
  assertNear(r.x, 520, 'x'); assertNear(r.y, 500, 'y');
});

// ─── SECTION B: Front-view (0,1,0) ──────────────────────────────────────────
// viewDir=(0,1,0): looking along +Y
//   right = normalize((0,1,0) × (0,1,0)) — need reference-up
//   forward=(0,1,0), |fy|=1 > 0.999, so refUp=(1,0,0)
//   right = normalize((1,0,0) × (0,1,0)) = normalize(0*0-0*1, 0*0-1*0, 1*1-0*0) = (0,0,1) → normalize = (0,0,1)
//   Actually: refUp×forward = (1,0,0)×(0,1,0):
//     x = 0*0 - 0*1 = 0
//     y = 0*0 - 1*0 = 0
//     z = 1*1 - 0*0 = 1
//   right = (0,0,1)
//   up = forward × right = (0,1,0)×(0,0,1) = (1*1-0*0, 0*0-0*1, 0*0-1*0) = (1,0,0)
// So: screenX = dot(V, (0,0,1)) = Vz, screenY = dot(V, (1,0,0)) = Vx
console.log('\n--- B. Front-view (0,1,0): looking along +Y ---');

test('B1: Front-view basis correct (right=(0,0,1), up=(1,0,0))', () => {
  const b = computeViewBasis(0,1,0);
  assertNear(b.right.x, 0, 'right.x'); assertNear(b.right.y, 0, 'right.y'); assertNear(b.right.z, 1, 'right.z');
  assertNear(b.up.x,    1, 'up.x');    assertNear(b.up.y,    0, 'up.y');    assertNear(b.up.z,    0, 'up.z');
});

test('B2: Front-view, P=(100,200,50), viewCenter=(100,200,0), vpCenter=(0,0), scale=1', () => {
  // V=(0,0,50): screenX=dot((0,0,50),(0,0,1))=50, screenY=dot((0,0,50),(1,0,0))=0
  const r = projectPoint(100,200,50, [100,200,0], [0,0], 1, 0, 0,1,0);
  assertNear(r.x, 50, 'x=50'); assertNear(r.y, 0, 'y=0');
});

test('B3: Front-view, P=(110,200,0), viewCenter=(100,200,0), vpCenter=(500,500), scale=1', () => {
  // V=(10,0,0): screenX=dot((10,0,0),(0,0,1))=0, screenY=dot((10,0,0),(1,0,0))=10
  const r = projectPoint(110,200,0, [100,200,0], [500,500], 1, 0, 0,1,0);
  assertNear(r.x, 500, 'x'); assertNear(r.y, 510, 'y');
});

// ─── SECTION C: Side-view (1,0,0) ────────────────────────────────────────────
// viewDir=(1,0,0): looking along +X
//   forward=(1,0,0), |fy|<0.999, refUp=(0,1,0)
//   right = normalize((0,1,0)×(1,0,0)) = normalize(0*0-0*0, 0*1-0*0, 0*0-1*1) = (0,0,-1)
//   up    = forward × right = (1,0,0)×(0,0,-1) = (0*(-1)-0*0, 0*0-1*(-1), 1*0-0*0) = (0,1,0)
// So: screenX = dot(V, (0,0,-1)) = -Vz, screenY = dot(V, (0,1,0)) = Vy
console.log('\n--- C. Side-view (1,0,0): looking along +X ---');

test('C1: Side-view basis (right=(0,0,-1), up=(0,1,0))', () => {
  const b = computeViewBasis(1,0,0);
  assertNear(b.right.x, 0, 'right.x'); assertNear(b.right.y, 0, 'right.y'); assertNear(b.right.z, -1, 'right.z');
  assertNear(b.up.x,    0, 'up.x');    assertNear(b.up.y,    1, 'up.y');    assertNear(b.up.z,     0, 'up.z');
});

test('C2: Side-view P=(200,110,0), viewCenter=(200,100,0), vpCenter=(500,500), scale=1', () => {
  // V=(0,10,0): screenX=dot(V,(0,0,-1))=0, screenY=dot(V,(0,1,0))=10
  const r = projectPoint(200,110,0, [200,100,0], [500,500], 1, 0, 1,0,0);
  assertNear(r.x, 500, 'x'); assertNear(r.y, 510, 'y');
});

// ─── SECTION D: Arbitrary (1,1,1)/sqrt(3) ────────────────────────────────────
console.log('\n--- D. Arbitrary direction (1,1,1) ---');

test('D1: Basis orthonormality for (1,1,1)', () => {
  const b = computeViewBasis(1,1,1);
  // Lengths ≈ 1
  const rLen = Math.sqrt(b.right.x**2 + b.right.y**2 + b.right.z**2);
  const uLen = Math.sqrt(b.up.x**2 + b.up.y**2 + b.up.z**2);
  const fLen = Math.sqrt(b.forward.x**2 + b.forward.y**2 + b.forward.z**2);
  assertNear(rLen, 1, '|right|=1');
  assertNear(uLen, 1, '|up|=1');
  assertNear(fLen, 1, '|forward|=1');
  // Orthogonality
  assertNear(dot3(b.right, b.up),      0, 'right·up=0');
  assertNear(dot3(b.right, b.forward), 0, 'right·forward=0');
  assertNear(dot3(b.up, b.forward),    0, 'up·forward=0');
});

test('D2: (1,1,1) forward is normalized (1,1,1)/sqrt(3)', () => {
  const b = computeViewBasis(1,1,1);
  const s = 1 / Math.sqrt(3);
  assertNear(b.forward.x, s, 'fwd.x');
  assertNear(b.forward.y, s, 'fwd.y');
  assertNear(b.forward.z, s, 'fwd.z');
});

// ─── SECTION E: Point at viewCenter → vpCenter (any direction) ───────────────
console.log('\n--- E. Point at viewCenter always maps to vpCenter ---');

const viewDirs = [[0,0,1],[1,0,0],[0,1,0],[1,1,0],[1,1,1],[-1,0,0],[0,-1,1]];
for (const d of viewDirs) {
  const label = `E: (${d.join(',')}) viewCenter→vpCenter`;
  test(label, () => {
    const r = projectPoint(50,50,50, [50,50,50], [300,400], 2.5, 0, d[0],d[1],d[2]);
    assertNear(r.x, 300, 'x=vpCenterX');
    assertNear(r.y, 400, 'y=vpCenterY');
  });
}

// ─── SECTION F: Non-unit viewDirection normalized ────────────────────────────
console.log('\n--- F. Non-unit viewDirection must equal unit version ---');

test('F1: (10,0,0) same as (1,0,0)', () => {
  const r1 = projectPoint(200,110,0, [200,100,0], [500,500], 1, 0, 10,0,0);
  const r2 = projectPoint(200,110,0, [200,100,0], [500,500], 1, 0, 1,0,0);
  assertNear(r1.x, r2.x, 'x equal');
  assertNear(r1.y, r2.y, 'y equal');
});

test('F2: (0,0,5) same as (0,0,1)', () => {
  const r1 = projectPoint(110,100,0, [100,100,0], [500,500], 1, 0, 0,0,5);
  const r2 = projectPoint(110,100,0, [100,100,0], [500,500], 1, 0, 0,0,1);
  assertNear(r1.x, r2.x, 'x equal');
  assertNear(r1.y, r2.y, 'y equal');
});

// ─── SECTION G: Basis orthonormality for all standard views ──────────────────
console.log('\n--- G. Basis orthonormality for standard views ---');

const standardDirs: Array<[number,number,number]> = [[0,0,1],[1,0,0],[0,1,0],[0,0,-1],[-1,0,0],[0,-1,0]];
for (const d of standardDirs) {
  test(`G: orthonormal basis for (${d.join(',')})`, () => {
    const b = computeViewBasis(d[0],d[1],d[2]);
    const rLen = Math.sqrt(b.right.x**2+b.right.y**2+b.right.z**2);
    const uLen = Math.sqrt(b.up.x**2+b.up.y**2+b.up.z**2);
    assertNear(rLen, 1, `|right|=1`);
    assertNear(uLen, 1, `|up|=1`);
    assertNear(dot3(b.right, b.up),      0, `right·up=0`);
    assertNear(dot3(b.right, b.forward), 0, `right·fwd=0`);
    assertNear(dot3(b.up, b.forward),    0, `up·fwd=0`);
  });
}

// ─── SECTION H: Twist + non-Z interaction ────────────────────────────────────
console.log('\n--- H. Twist combined with non-Z direction ---');

test('H1: Z-view + 90° twist gives same result as 5.16C-B twist test', () => {
  // From 5.16C-B test: P=(110,100), viewCenter=(100,100), vpCenter=(500,500), twist=π/2 → (500,490)
  const r = projectPoint(110,100,0, [100,100,0], [500,500], 1, Math.PI/2, 0,0,1);
  assertNear(r.x, 500, 'x=500');
  assertNear(r.y, 490, 'y=490');
});

test('H2: 360° twist = identity (any direction)', () => {
  const r0 = projectPoint(110,100,0, [100,100,0], [500,500], 1, 0,           0,0,1);
  const r1 = projectPoint(110,100,0, [100,100,0], [500,500], 1, 2*Math.PI,   0,0,1);
  assertNear(r0.x, r1.x, 'x same'); assertNear(r0.y, r1.y, 'y same');
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error('\n❌ UNIT TESTS FAILED'); process.exit(1); }
else             { console.log('\n✅ ALL UNIT TESTS PASSED'); }

export {};

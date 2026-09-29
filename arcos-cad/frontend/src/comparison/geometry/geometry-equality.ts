import { COMPARISON_TOLERANCE } from './geometry-tolerance';

export function isAlmostEqual(a: number, b: number, tol = COMPARISON_TOLERANCE.geometry): boolean {
  return Math.abs(a - b) <= tol;
}

export function isPointEqual(p1: number[], p2: number[], tol = COMPARISON_TOLERANCE.geometry): boolean {
  if (p1.length !== p2.length) return false;
  for (let i = 0; i < p1.length; i++) {
    if (!isAlmostEqual(p1[i], p2[i], tol)) return false;
  }
  return true;
}

export function isAngleEqual(a1: number, a2: number, tol = COMPARISON_TOLERANCE.angle): boolean {
  // Angles are typically in [0, 2PI]. Need to handle wrap-around.
  let diff = Math.abs((a1 % (2 * Math.PI)) - (a2 % (2 * Math.PI)));
  if (diff > Math.PI) {
    diff = 2 * Math.PI - diff;
  }
  return diff <= tol;
}

export function isGeometryEqual(entityType: string, g1: any, g2: any): boolean {
  if (!g1 || !g2) return false;

  switch (entityType) {
    case 'LINE':
      return isPointEqual(g1.start, g2.start) && isPointEqual(g1.end, g2.end);
    case 'LWPOLYLINE':
      if (g1.closed !== g2.closed) return false;
      if (g1.vertices.length !== g2.vertices.length) return false;
      for (let i = 0; i < g1.vertices.length; i++) {
        if (!isPointEqual(g1.vertices[i], g2.vertices[i], COMPARISON_TOLERANCE.bulge)) return false; // comparing [x,y,z,bulge]
      }
      return true;
    case 'CIRCLE':
      return isPointEqual(g1.center, g2.center) && isAlmostEqual(g1.radius, g2.radius, COMPARISON_TOLERANCE.radius);
    case 'ARC':
      return isPointEqual(g1.center, g2.center) &&
             isAlmostEqual(g1.radius, g2.radius, COMPARISON_TOLERANCE.radius) &&
             isAngleEqual(g1.startAngle, g2.startAngle) &&
             isAngleEqual(g1.endAngle, g2.endAngle);
    default:
      return false; // Safely return false for unsupported types
  }
}


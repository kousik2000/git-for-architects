import type { CadEntity } from '../../types/cad-json';

export interface NormalizedGeometry {
  [key: string]: any;
}

export function normalizeGeometry(entity: CadEntity): NormalizedGeometry | null {
  if (!entity.geometry) return null;

  switch (entity.type) {
    case 'LINE': {
      const g = entity.geometry;
      if (!g.start || !g.end) return null;
      
      const s = g.start;
      const e = g.end;
      
      // Lexicographical sorting so A->B is equivalent to B->A
      let first = s;
      let second = e;
      
      if (s[0] > e[0] || (s[0] === e[0] && s[1] > e[1]) || (s[0] === e[0] && s[1] === e[1] && (s[2]||0) > (e[2]||0))) {
        first = e;
        second = s;
      }
      
      return {
        start: [...first],
        end: [...second],
        bounds: {
          min: [Math.min(first[0], second[0]), Math.min(first[1], second[1])],
          max: [Math.max(first[0], second[0]), Math.max(first[1], second[1])]
        }
      };
    }
    case 'LWPOLYLINE': {
      const g = entity.geometry;
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      if (g.vertices) {
        for (const v of g.vertices) {
          if (v[0] < minX) minX = v[0];
          if (v[0] > maxX) maxX = v[0];
          if (v[1] < minY) minY = v[1];
          if (v[1] > maxY) maxY = v[1];
        }
      }
      return {
        vertices: g.vertices ? g.vertices.map(v => [...v]) : [],
        closed: !!g.closed,
        bounds: { min: [minX, minY], max: [maxX, maxY] }
      };
    }
    case 'CIRCLE': {
      const g = entity.geometry;
      const r = g.radius || 0;
      return {
        center: g.center ? [...g.center] : [0, 0, 0],
        radius: r,
        bounds: {
          min: [g.center ? g.center[0] - r : -r, g.center ? g.center[1] - r : -r],
          max: [g.center ? g.center[0] + r : r, g.center ? g.center[1] + r : r]
        }
      };
    }
    case 'ARC': {
      const g = entity.geometry;
      // Normalize angles to [0, 2PI]
      const normalizeAngle = (a: number) => {
        let normalized = a % (2 * Math.PI);
        if (normalized < 0) normalized += 2 * Math.PI;
        return normalized;
      };
      
      return {
        center: g.center ? [...g.center] : [0, 0, 0],
        radius: g.radius || 0,
        startAngle: g.startAngle !== undefined ? normalizeAngle(g.startAngle) : 0,
        endAngle: g.endAngle !== undefined ? normalizeAngle(g.endAngle) : 0
      };
    }
    default:
      // For entities not yet fully supported for geometric comparison, return raw or null
      return null;
  }
}

export function serializeNormalizedGeometry(geom: NormalizedGeometry | null): string {
  if (!geom) return '';
  // Basic serialization for signature, with fixed precision to avoid floating point hash jitter
  return JSON.stringify(geom, (key, value) => {
    if (key === 'bounds') return undefined; // Exclude bounds from signature
    if (typeof value === 'number') {
      return Number(value.toFixed(4));
    }
    return value;
  });
}

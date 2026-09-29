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
        end: [...second]
      };
    }
    case 'LWPOLYLINE': {
      const g = entity.geometry;
      // Do not perform cyclic rotation for V1
      return {
        vertices: g.vertices ? g.vertices.map(v => [...v]) : [],
        closed: !!g.closed
      };
    }
    case 'CIRCLE': {
      const g = entity.geometry;
      return {
        center: g.center ? [...g.center] : [0, 0, 0],
        radius: g.radius || 0
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
    if (typeof value === 'number') {
      return Number(value.toFixed(4));
    }
    return value;
  });
}

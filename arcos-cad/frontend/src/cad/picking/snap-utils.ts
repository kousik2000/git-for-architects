import * as THREE from 'three';
import type { CadEntity } from '../../types/cad-json';
import type { SnapCandidate } from '../types/measurement';
import type { SelectionReference } from '../renderer/CadRenderer';

/**
 * Generates snap candidates for a given entity, mapped into world space via the parent matrix.
 */
export function generateSnapCandidates(
  entity: CadEntity, 
  parentMatrix: THREE.Matrix4,
  reference: SelectionReference,
  worldPoint?: THREE.Vector3
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  const addCandidate = (type: SnapCandidate['type'], localVec: THREE.Vector3) => {
    const worldVec = localVec.clone().applyMatrix4(parentMatrix);
    candidates.push({
      type,
      point: { x: worldVec.x, y: worldVec.y, z: worldVec.z },
      entityId: reference.entityId,
      entityType: reference.entityType,
      layer: reference.layer,
      distance: 0, // Will be computed during lookup
      insertPath: reference.insertPath,
      space: reference.space as 'model' | 'layout',
      viewportId: reference.viewportId
    });
  };

  switch (entity.type) {
    case 'LINE':
      if (entity.geometry) {
        const start = new THREE.Vector3(entity.geometry.start[0], entity.geometry.start[1], entity.geometry.start[2] || 0);
        const end = new THREE.Vector3(entity.geometry.end[0], entity.geometry.end[1], entity.geometry.end[2] || 0);
        addCandidate('endpoint', start);
        addCandidate('endpoint', end);
        addCandidate('midpoint', new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5));
        
        if (worldPoint) {
          const invMatrix = parentMatrix.clone().invert();
          const localWorldPoint = worldPoint.clone().applyMatrix4(invMatrix);
          const line3 = new THREE.Line3(start, end);
          const closestPoint = new THREE.Vector3();
          line3.closestPointToPoint(localWorldPoint, true, closestPoint);
          addCandidate('nearest', closestPoint);
        }
      }
      break;

    case 'LWPOLYLINE':
      if (entity.geometry && entity.geometry.vertices) {
        const verts = entity.geometry.vertices;
        let localWorldPoint: THREE.Vector3 | null = null;
        if (worldPoint) {
          const invMatrix = parentMatrix.clone().invert();
          localWorldPoint = worldPoint.clone().applyMatrix4(invMatrix);
        }

        let closestDistSq = Infinity;
        let bestNearestPoint: THREE.Vector3 | null = null;

        for (let i = 0; i < verts.length; i++) {
          const v = verts[i];
          const curr = new THREE.Vector3(v.x, v.y, 0);
          addCandidate('endpoint', curr);

          if (i < verts.length - 1) {
            const nextV = verts[i+1];
            const next = new THREE.Vector3(nextV.x, nextV.y, 0);
            addCandidate('midpoint', new THREE.Vector3().addVectors(curr, next).multiplyScalar(0.5));
            
            if (localWorldPoint) {
              const line3 = new THREE.Line3(curr, next);
              const closestPoint = new THREE.Vector3();
              line3.closestPointToPoint(localWorldPoint, true, closestPoint);
              const distSq = closestPoint.distanceToSquared(localWorldPoint);
              if (distSq < closestDistSq) {
                closestDistSq = distSq;
                bestNearestPoint = closestPoint;
              }
            }
          }
        }
        // Handle closed polyline midpoint between last and first
        if (entity.geometry.closed && verts.length > 2) {
          const first = new THREE.Vector3(verts[0].x, verts[0].y, 0);
          const last = new THREE.Vector3(verts[verts.length-1].x, verts[verts.length-1].y, 0);
          addCandidate('midpoint', new THREE.Vector3().addVectors(last, first).multiplyScalar(0.5));

          if (localWorldPoint) {
            const line3 = new THREE.Line3(last, first);
            const closestPoint = new THREE.Vector3();
            line3.closestPointToPoint(localWorldPoint, true, closestPoint);
            const distSq = closestPoint.distanceToSquared(localWorldPoint);
            if (distSq < closestDistSq) {
              closestDistSq = distSq;
              bestNearestPoint = closestPoint;
            }
          }
        }

        if (bestNearestPoint) {
          addCandidate('nearest', bestNearestPoint);
        }
      }
      break;

    case 'CIRCLE':
      if (entity.geometry) {
        addCandidate('center', new THREE.Vector3(entity.geometry.center[0], entity.geometry.center[1], entity.geometry.center[2] || 0));
        
        // Nearest for CIRCLE
        if (worldPoint && entity.geometry.radius !== undefined) {
          const invMatrix = parentMatrix.clone().invert();
          const localWorldPoint = worldPoint.clone().applyMatrix4(invMatrix);
          const cx = entity.geometry.center[0];
          const cy = entity.geometry.center[1];
          const cz = entity.geometry.center[2] || 0;
          
          const dx = localWorldPoint.x - cx;
          const dy = localWorldPoint.y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist > 1e-6) {
            const nx = cx + (dx / dist) * entity.geometry.radius;
            const ny = cy + (dy / dist) * entity.geometry.radius;
            addCandidate('nearest', new THREE.Vector3(nx, ny, cz));
          }
        }
      }
      break;

    case 'ARC':
      if (entity.geometry) {
        const cx = entity.geometry.center[0];
        const cy = entity.geometry.center[1];
        const cz = entity.geometry.center[2] || 0;
        const center = new THREE.Vector3(cx, cy, cz);
        addCandidate('center', center);
        
        if (entity.geometry.radius !== undefined && entity.geometry.startAngle !== undefined && entity.geometry.endAngle !== undefined) {
          const r = entity.geometry.radius;
          const sa = entity.geometry.startAngle * Math.PI / 180; // convert from degrees
          let ea = entity.geometry.endAngle * Math.PI / 180;

          const startX = cx + r * Math.cos(sa);
          const startY = cy + r * Math.sin(sa);
          addCandidate('endpoint', new THREE.Vector3(startX, startY, cz));

          const endX = cx + r * Math.cos(ea);
          const endY = cy + r * Math.sin(ea);
          addCandidate('endpoint', new THREE.Vector3(endX, endY, cz));
          
          // Midpoint
          let angleDiff = ea - sa;
          if (angleDiff < 0) angleDiff += Math.PI * 2;
          const midAngle = sa + angleDiff / 2;
          
          const midX = cx + r * Math.cos(midAngle);
          const midY = cy + r * Math.sin(midAngle);
          addCandidate('midpoint', new THREE.Vector3(midX, midY, cz));
          
          // Nearest
          if (worldPoint) {
            const invMatrix = parentMatrix.clone().invert();
            const localWorldPoint = worldPoint.clone().applyMatrix4(invMatrix);
            const dx = localWorldPoint.x - cx;
            const dy = localWorldPoint.y - cy;
            const dist = Math.hypot(dx, dy);
            
            if (dist > 1e-6) {
              let ptAngle = Math.atan2(dy, dx);
              if (ptAngle < 0) ptAngle += Math.PI * 2;
              
              // Normalize sa and ea to [0, 2PI]
              let normSa = sa % (Math.PI * 2);
              if (normSa < 0) normSa += Math.PI * 2;
              let normEa = ea % (Math.PI * 2);
              if (normEa < 0) normEa += Math.PI * 2;
              
              let isWithin = false;
              if (normSa < normEa) {
                isWithin = ptAngle >= normSa && ptAngle <= normEa;
              } else {
                isWithin = ptAngle >= normSa || ptAngle <= normEa;
              }
              
              if (isWithin) {
                const nx = cx + (dx / dist) * r;
                const ny = cy + (dy / dist) * r;
                addCandidate('nearest', new THREE.Vector3(nx, ny, cz));
              }
            }
          }
        }
      }
      break;
  }

  return candidates;
}

const priorityMap: Record<string, number> = {
  endpoint: 4,
  center: 3,
  midpoint: 2,
  nearest: 1
};

export function findClosestSnapCandidate(
  candidates: SnapCandidate[], 
  worldPoint: THREE.Vector3, 
  worldTolerance: number
): SnapCandidate | null {
  const sqTolerance = worldTolerance * worldTolerance;
  
  // 1. Filter candidates within tolerance and calculate exact distance
  const validCandidates = candidates.map(c => {
    const dx = c.point.x - worldPoint.x;
    const dy = c.point.y - worldPoint.y;
    // We ignore Z for snapping distance (orthographic projection)
    const sqDist = dx * dx + dy * dy;
    return { ...c, sqDist, distance: Math.sqrt(sqDist) };
  }).filter(c => c.sqDist <= sqTolerance);

  if (validCandidates.length === 0) {
    return null;
  }

  // 2. Find the highest priority among valid candidates
  let maxPriority = -1;
  for (const c of validCandidates) {
    const p = priorityMap[c.type] || 0;
    if (p > maxPriority) {
      maxPriority = p;
    }
  }

  // 3. Filter to only the highest priority candidates
  const highestPriorityCandidates = validCandidates.filter(c => (priorityMap[c.type] || 0) === maxPriority);

  // 4. Find the closest among the highest priority candidates
  let closest: SnapCandidate | null = null;
  let minSqDist = Infinity;

  for (const c of highestPriorityCandidates) {
    if (c.sqDist < minSqDist) {
      minSqDist = c.sqDist;
      closest = c;
    }
  }

  return closest;
}

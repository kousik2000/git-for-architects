import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findClosestSnapCandidate } from './snap-utils';
import type { SnapCandidate } from '../types/measurement';

describe('OSNAP Priority and Candidate Selection', () => {
  const worldPoint = new THREE.Vector3(0, 0, 0);
  const tolerance = 10;

  it('should prefer endpoint over nearest if both are within tolerance but nearest is physically closer', () => {
    const candidates: SnapCandidate[] = [
      { type: 'nearest', point: new THREE.Vector3(1, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' },
      { type: 'endpoint', point: new THREE.Vector3(5, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' }
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, tolerance);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('endpoint');
    expect(result?.distance).toBe(5);
  });

  it('should pick nearest if endpoint is outside tolerance', () => {
    const candidates: SnapCandidate[] = [
      { type: 'nearest', point: new THREE.Vector3(1, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' },
      { type: 'endpoint', point: new THREE.Vector3(15, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' }
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, tolerance);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('nearest');
    expect(result?.distance).toBe(1);
  });

  it('should prefer center over nearest if both are within tolerance', () => {
    const candidates: SnapCandidate[] = [
      { type: 'nearest', point: new THREE.Vector3(2, 2, 0), entityId: 'e1', entityType: 'ARC', layer: '0', insertPath: [], space: 'model' },
      { type: 'center', point: new THREE.Vector3(6, 6, 0), entityId: 'e1', entityType: 'ARC', layer: '0', insertPath: [], space: 'model' } 
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, tolerance);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('center');
  });

  it('should prefer midpoint over nearest if both are within tolerance', () => {
    const candidates: SnapCandidate[] = [
      { type: 'nearest', point: new THREE.Vector3(1, 1, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' },
      { type: 'midpoint', point: new THREE.Vector3(5, 5, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' } 
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, tolerance);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('midpoint');
  });

  it('should pick the physically closest candidate when comparing two of the SAME type', () => {
    const candidates: SnapCandidate[] = [
      { type: 'endpoint', point: new THREE.Vector3(9, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' },
      { type: 'endpoint', point: new THREE.Vector3(4, 0, 0), entityId: 'e2', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' }
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, tolerance);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('endpoint');
    expect(result?.entityId).toBe('e2');
    expect(result?.distance).toBe(4);
  });

  it('should reject all candidates if none are within tolerance', () => {
    const candidates: SnapCandidate[] = [
      { type: 'endpoint', point: new THREE.Vector3(11, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' },
      { type: 'center', point: new THREE.Vector3(0, 11, 0), entityId: 'e2', entityType: 'CIRCLE', layer: '0', insertPath: [], space: 'model' }
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, 10);
    expect(result).toBeNull();
  });

  it('should accept a candidate that is exactly AT tolerance limit', () => {
    const candidates: SnapCandidate[] = [
      { type: 'endpoint', point: new THREE.Vector3(10, 0, 0), entityId: 'e1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model' }
    ];

    const result = findClosestSnapCandidate(candidates, worldPoint, 10);
    expect(result).not.toBeNull();
    expect(result?.distance).toBe(10);
  });
});

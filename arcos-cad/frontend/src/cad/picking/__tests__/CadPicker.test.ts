import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CadTransformResolver } from '../../transforms/CadTransformResolver';
import { generateSnapCandidates, findClosestSnapCandidate } from '../snap-utils';
import type { CadEntity } from '../../../types/cad-json';
import type { SelectionReference } from '../../renderer/CadRenderer';


describe('Measurement & Picking Architecture', () => {
  describe('CadTransformResolver', () => {
    it('composes transforms correctly for a nested INSERT path', () => {
      // Mock entities
      const entities: Record<string, CadEntity> = {
        'A': { id: 'A', type: 'INSERT', layer: '0', style: {} as any, geometry: { insertionPoint: [10, 20, 0], scale: [2, 2, 1], rotation: 0 } as any },
        'B': { id: 'B', type: 'INSERT', layer: '0', style: {} as any, geometry: { insertionPoint: [5, 5, 0], scale: [1, 1, 1], rotation: Math.PI / 2 } as any }
      };

      const matrix = CadTransformResolver.resolveTransformWithLookup(['A', 'B'], (id) => entities[id]);
      
      const localPoint = new THREE.Vector3(1, 0, 0); // e.g., a vertex of a line inside B
      const worldPoint = localPoint.clone().applyMatrix4(matrix);

      // A scales by 2, translates by (10, 20).
      // B rotates by 90 deg, translates by (5, 5).
      // Vector (1, 0) in B becomes (0, 1) in B's local space (after rotation).
      // Then translated by (5, 5) -> (5, 6).
      // Then in A, scaled by 2 -> (10, 12).
      // Then translated by (10, 20) -> (20, 32).
      
      expect(worldPoint.x).toBeCloseTo(20);
      expect(worldPoint.y).toBeCloseTo(32);
      expect(worldPoint.z).toBeCloseTo(0);
    });
  });

  describe('Snap Candidate Generation', () => {
    const mockRef: SelectionReference = {
      entityId: 'E1',
      entityType: 'LINE',
      layer: '0',
      insertPath: [],
      space: 'model',
      viewportId: 'VP1'
    };
    const identityMatrix = new THREE.Matrix4();

    it('generates endpoints and midpoint for LINE', () => {
      const line: CadEntity = {
        id: 'E1', type: 'LINE', layer: '0', style: {} as any,
        geometry: { start: [0, 0, 0], end: [10, 0, 0] }
      } as any;

      const candidates = generateSnapCandidates(line, identityMatrix, mockRef);
      expect(candidates).toHaveLength(3);
      
      const endpoints = candidates.filter(c => c.type === 'endpoint');
      const midpoints = candidates.filter(c => c.type === 'midpoint');
      
      expect(endpoints).toHaveLength(2);
      expect(midpoints).toHaveLength(1);
      
      expect(endpoints[0].point).toEqual({ x: 0, y: 0, z: 0 });
      expect(endpoints[1].point).toEqual({ x: 10, y: 0, z: 0 });
      expect(midpoints[0].point).toEqual({ x: 5, y: 0, z: 0 });

      // Propagates context
      expect(candidates[0].space).toBe('model');
      expect(candidates[0].viewportId).toBe('VP1');
    });

    it('generates center for CIRCLE', () => {
      const circle: CadEntity = {
        id: 'E1', type: 'CIRCLE', layer: '0', style: {} as any,
        geometry: { center: [5, 5, 0], radius: 2 }
      } as any;

      const candidates = generateSnapCandidates(circle, identityMatrix, mockRef);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].type).toBe('center');
      expect(candidates[0].point).toEqual({ x: 5, y: 5, z: 0 });
    });

    it('generates nearest for LINE when worldPoint is provided', () => {
      const line: CadEntity = {
        id: 'E1', type: 'LINE', layer: '0', style: {} as any,
        geometry: { start: [0, 0, 0], end: [10, 0, 0] }
      } as any;

      const cursor = new THREE.Vector3(2, 2, 0);
      const candidates = generateSnapCandidates(line, identityMatrix, mockRef, cursor);
      
      const nearest = candidates.find(c => c.type === 'nearest');
      expect(nearest).toBeDefined();
      expect(nearest?.point).toEqual({ x: 2, y: 0, z: 0 });
    });
  });

  describe('findClosestSnapCandidate', () => {
    it('returns the closest candidate within tolerance', () => {
      const mockRef: SelectionReference = {
        entityId: 'E1', entityType: 'LINE', layer: '0', insertPath: [], space: 'model'
      };
      const identityMatrix = new THREE.Matrix4();
      const line: CadEntity = {
        id: 'E1', type: 'LINE', layer: '0', style: {} as any,
        geometry: { start: [0, 0, 0], end: [100, 0, 0] }
      } as any;

      const candidates = generateSnapCandidates(line, identityMatrix, mockRef);
      
      // Cursor near start
      const cursor = new THREE.Vector3(2, 2, 0); // distance ~2.82 to (0,0,0)
      
      // Tolerance 5 should hit
      const hit = findClosestSnapCandidate(candidates, cursor, 5);
      expect(hit).not.toBeNull();
      expect(hit?.type).toBe('endpoint');
      expect(hit?.point).toEqual({ x: 0, y: 0, z: 0 });
      expect(hit?.distance).toBeCloseTo(Math.sqrt(8));

      // Tolerance 2 should miss
      const miss = findClosestSnapCandidate(candidates, cursor, 2);
      expect(miss).toBeNull();
    });

    it('applies priority rules when distances are equal', () => {
      // Endpoint vs Midpoint priority
      // endpoint=4, center=3, midpoint=2, nearest=1
      
      const c1 = { type: 'midpoint', point: { x: 0, y: 0, z: 0 } } as any;
      const c2 = { type: 'endpoint', point: { x: 0, y: 0, z: 0 } } as any;
      const c3 = { type: 'nearest', point: { x: 0, y: 0, z: 0 } } as any;

      const candidates = [c1, c2, c3];
      const cursor = new THREE.Vector3(0, 0, 0);

      const hit = findClosestSnapCandidate(candidates, cursor, 5);
      expect(hit?.type).toBe('endpoint'); // Endpoint has highest priority
    });
  });
});

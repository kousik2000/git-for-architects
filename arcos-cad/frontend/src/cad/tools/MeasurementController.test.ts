import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MeasurementController, MeasurementState } from './MeasurementController';

describe('MeasurementController', () => {
  it('should start in IDLE state', () => {
    const controller = new MeasurementController();
    expect(controller.getState()).toBe(MeasurementState.IDLE);
    expect(controller.isActive()).toBe(false);
  });

  it('should transition to FIRST_POINT_PENDING on start()', () => {
    const controller = new MeasurementController();
    controller.start();
    expect(controller.getState()).toBe(MeasurementState.FIRST_POINT_PENDING);
    expect(controller.isActive()).toBe(true);
  });

  it('should accept first point and transition to SECOND_POINT_PENDING', () => {
    const controller = new MeasurementController();
    controller.start();
    const p1 = new THREE.Vector3(10, 20, 0);
    const consumed = controller.handlePointClick(p1, null);
    
    expect(consumed).toBe(true);
    expect(controller.getState()).toBe(MeasurementState.SECOND_POINT_PENDING);
  });

  it('should accept second point and calculate distance correctly, returning to FIRST_POINT_PENDING', () => {
    const controller = new MeasurementController();
    controller.start();
    
    controller.handlePointClick(new THREE.Vector3(0, 0, 0), null);
    controller.handlePointClick(new THREE.Vector3(100, 100, 0), null);
    
    const history = controller.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].distance).toBeCloseTo(141.421, 3);
    
    // Auto restart
    expect(controller.getState()).toBe(MeasurementState.FIRST_POINT_PENDING);
  });

  it('should cancel measurement properly on cancel()', () => {
    const controller = new MeasurementController();
    controller.start();
    controller.handlePointClick(new THREE.Vector3(0, 0, 0), null);
    controller.cancel();
    
    expect(controller.getState()).toBe(MeasurementState.IDLE);
    expect(controller.isActive()).toBe(false);
  });

  it('should consume move events during measurement', () => {
    const controller = new MeasurementController();
    controller.start();
    controller.handlePointClick(new THREE.Vector3(0, 0, 0), null);
    
    const consumed = controller.handlePointerMove(new THREE.Vector3(50, 50, 0), null);
    expect(consumed).toBe(true);
    
    const preview = controller.getActivePreview();
    expect(preview).not.toBeNull();
    expect(preview?.distance).toBeCloseTo(70.71, 2);
  });

  it('should prefer snapped points when provided', () => {
    const controller = new MeasurementController();
    controller.start();
    
    const snapCandidate = {
      entityId: '1',
      entityType: 'LINE',
      layer: '0',
      point: { x: 10, y: 10, z: 0 },
      snapType: 'endpoint',
      insertPath: [],
      space: 'model' as const
    };
    
    controller.handlePointClick(new THREE.Vector3(0, 0, 0), null); // point 1
    
    // cursor is at (50, 50) but snap is at (10, 10)
    controller.handlePointerMove(new THREE.Vector3(50, 50, 0), snapCandidate);
    const preview = controller.getActivePreview();
    
    // Expect distance from (0,0) to snap point (10,10)
    expect(preview?.distance).toBeCloseTo(14.142, 3);
  });

  it('should isolate multiple measurement histories correctly', () => {
    const controller = new MeasurementController();
    controller.start();
    
    // Measurement 1
    controller.handlePointClick(new THREE.Vector3(0, 0, 0), null);
    controller.handlePointClick(new THREE.Vector3(10, 0, 0), null);
    
    // Measurement 2
    controller.handlePointClick(new THREE.Vector3(20, 20, 0), null);
    controller.handlePointClick(new THREE.Vector3(20, 30, 0), null);
    
    const history = controller.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].distance).toBe(10);
    expect(history[1].distance).toBe(10);
    
    // Verify they have unique IDs and points
    expect(history[0].id).not.toBe(history[1].id);
    expect(history[0].point1.x).toBe(0);
    expect(history[1].point1.x).toBe(20);
    
    // Verify preview is cleared immediately after completion
    expect(controller.getActivePreview()).toBeNull();
  });
});

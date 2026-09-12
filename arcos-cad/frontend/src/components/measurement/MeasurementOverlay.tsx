import React, { useEffect, useRef, useState } from 'react';
import type { MeasurementController, DistanceMeasurement, MeasurementState } from '../../cad/tools/MeasurementController';
import type { CadRenderer } from '../../cad/renderer/CadRenderer';
import * as THREE from 'three';
import './MeasurementOverlay.css';

interface MeasurementOverlayProps {
  controller: MeasurementController | undefined;
  renderer: CadRenderer | null;
  unitSystem: string;
}

export const MeasurementOverlay: React.FC<MeasurementOverlayProps> = ({ controller, renderer, unitSystem }) => {
  const [isActive, setIsActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // We use local refs for high-frequency data to avoid React render thrashing
  const previewDataRef = useRef<{ point1: THREE.Vector3; currentPoint: THREE.Vector3; distance: number } | null>(null);
  const historyRef = useRef<DistanceMeasurement[]>([]);

  useEffect(() => {
    if (!controller) return;

    // Subscribe to state changes
    const updateCallback = (
      state: MeasurementState, 
      activePreview: any, 
      history: DistanceMeasurement[]
    ) => {
      setIsActive(state !== 'IDLE' || history.length > 0);
      previewDataRef.current = activePreview;
      historyRef.current = history;
      updateDOM(); // immediate update on state change
    };

    controller.setOnUpdateCallback(updateCallback);
    
    // Initial sync
    updateCallback(controller.getState(), controller.getActivePreview(), controller.getHistory());

    return () => {
      controller.setOnUpdateCallback(() => {});
    };
  }, [controller]);

  // The actual DOM update logic
  const updateDOM = () => {
    if (!containerRef.current || !renderer) return;

    let previewEl = containerRef.current.querySelector('#meas-preview') as HTMLDivElement;
    
    if (previewDataRef.current) {
      if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.id = 'meas-preview';
        previewEl.className = 'measurement-label';
        containerRef.current.appendChild(previewEl);
      }
      
      const p1 = previewDataRef.current.point1;
      const p2 = previewDataRef.current.currentPoint;
      const dist = previewDataRef.current.distance;
      
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      
      const screenPos = renderer.getScreenPointFromWorld(new THREE.Vector3(midX, midY, 0));
      if (screenPos) {
        previewEl.style.transform = `translate(-50%, -50%) translate(${screenPos.x}px, ${screenPos.y}px)`;
        previewEl.textContent = `${dist.toFixed(2)} ${unitSystem}`;
        previewEl.style.display = 'block';
      }
    } else if (previewEl) {
      previewEl.style.display = 'none';
    }

    const history = historyRef.current;
    history.forEach((meas, index) => {
      let el = containerRef.current?.querySelector(`#meas-hist-${index}`) as HTMLDivElement;
      if (!el) {
        el = document.createElement('div');
        el.id = `meas-hist-${index}`;
        el.className = 'measurement-label measurement-history-label';
        containerRef.current?.appendChild(el);
      }
      
      const midX = (meas.point1.x + meas.point2.x) / 2;
      const midY = (meas.point1.y + meas.point2.y) / 2;
      const screenPos = renderer.getScreenPointFromWorld(new THREE.Vector3(midX, midY, 0));
      if (screenPos) {
        el.style.transform = `translate(-50%, -50%) translate(${screenPos.x}px, ${screenPos.y}px)`;
        el.textContent = `${meas.distance.toFixed(2)} ${unitSystem}`;
      }
    });
    
    const allHistNodes = containerRef.current.querySelectorAll('.measurement-history-label');
    allHistNodes.forEach(node => {
      const idx = parseInt(node.id.replace('meas-hist-', ''), 10);
      if (idx >= history.length) {
        node.remove();
      }
    });
  };

  useEffect(() => {
    if (!isActive || !renderer) return;

    // To avoid RAF, we listen to an event dispatched by CadRenderer whenever the camera/scene changes
    const onRender = () => {
      updateDOM();
    };

    const container = renderer.getContainer();
    container.addEventListener('cad-render-update', onRender);

    return () => {
      container.removeEventListener('cad-render-update', onRender);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [isActive, renderer, unitSystem]);

  if (!isActive) return null;

  return (
    <div className="measurement-overlay-container" style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>
    </div>
  );
};

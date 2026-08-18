import React, { useEffect, useRef } from 'react';
import { CadRenderer } from '../../cad/renderer/CadRenderer';
import type { ArcosCadDocument } from '../../types/cad-json';
import './CadViewer.css';

interface CadViewerProps {
  document: ArcosCadDocument | null;
  onClose?: () => void;
}

export const CadViewer: React.FC<CadViewerProps> = ({ document, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);

  // Initialize renderer on mount
  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
      rendererRef.current = new CadRenderer(containerRef.current);
    }

    return () => {
      // Cleanup on unmount
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  // Load document when it changes
  useEffect(() => {
    if (rendererRef.current && document) {
      rendererRef.current.loadDocument(document);
    }
  }, [document]);

  const handleFit = () => {
    if (rendererRef.current) {
      rendererRef.current.fitToDrawing();
    }
  };

  return (
    <div className="cad-viewer-container">
      <div className="cad-viewer-toolbar">
        <span>ARCOS CAD VIEWER (Phase 5.6)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {document && (
            <span className="cad-viewer-stats" style={{ fontSize: '0.9em' }}>
              Total: {document.statistics.totalEntities} | 
              LINE: {document.statistics.entityTypes['LINE'] || 0} | 
              LWPOLY: {document.statistics.entityTypes['LWPOLYLINE'] || 0} | 
              TEXT: {document.statistics.entityTypes['TEXT'] || 0} | 
              HATCH: {document.statistics.entityTypes['HATCH'] || 0}
            </span>
          )}
          <button onClick={handleFit} style={{ padding: '4px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Fit to Drawing</button>
          {onClose && (
            <button onClick={onClose} style={{ padding: '4px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close Viewer</button>
          )}
        </div>
      </div>
      
      <div className="cad-viewer-canvas-wrapper" ref={containerRef}>
        {/* WebGL Canvas will be injected here by CadRenderer */}
      </div>
    </div>
  );
};

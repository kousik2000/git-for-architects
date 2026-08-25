import React, { useEffect, useRef, useState } from 'react';
import { CadRenderer } from '../../cad/renderer/CadRenderer';
import type { ArcosCadDocument } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { LayerPanel } from '../layer-panel/LayerPanel';
import './CadViewer.css';

interface CadViewerProps {
  document: ArcosCadDocument | null;
  onClose?: () => void;
}

export const CadViewer: React.FC<CadViewerProps> = ({ document, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);
  
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [currentSpace, setCurrentSpace] = useState<{type: 'model' | 'layout', name?: string}>({type: 'model'});

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
      
      // Initialize layer visibility state from document
      const initialVisibility: Record<string, boolean> = {};
      document.layers.forEach(layer => {
        initialVisibility[layer.name] = layer.visible && !layer.frozen;
      });
      setLayerVisibility(initialVisibility);
      setCurrentSpace({type: 'model'});
    }
  }, [document]);

  const handleSpaceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const nextSpace: {type: 'model' | 'layout', name?: string} = val === 'model' ? {type: 'model'} : {type: 'layout', name: val};
    setCurrentSpace(nextSpace);
    if (rendererRef.current && hasPermission(PERMISSIONS.CAD_LAYOUT_SWITCH)) {
      rendererRef.current.renderSpace(nextSpace.type, nextSpace.name);
    }
  };

  const handleFit = () => {
    if (rendererRef.current && hasPermission(PERMISSIONS.CAD_FIT)) {
      rendererRef.current.fitToDrawing();
    }
  };

  const handleToggleLayer = (layerName: string, visible: boolean) => {
    setLayerVisibility(prev => ({ ...prev, [layerName]: visible }));
    if (rendererRef.current) {
      rendererRef.current.setLayerVisibility(layerName, visible);
    }
  };

  const handleToggleAll = (visible: boolean) => {
    if (!document) return;
    const newVis: Record<string, boolean> = {};
    document.layers.forEach(layer => {
      if (!layer.frozen) {
        newVis[layer.name] = visible;
        if (rendererRef.current) {
          rendererRef.current.setLayerVisibility(layer.name, visible);
        }
      } else {
        // Keep frozen layers as false
        newVis[layer.name] = false;
      }
    });
    setLayerVisibility(newVis);
  };

  const canFit = hasPermission(PERMISSIONS.CAD_FIT);
  const canClose = hasPermission(PERMISSIONS.CAD_CLOSE);
  const canViewLayers = hasPermission(PERMISSIONS.CAD_LAYERS_VIEW);
  const canViewLayouts = hasPermission(PERMISSIONS.CAD_LAYOUTS_VIEW);
  const canSwitchLayout = hasPermission(PERMISSIONS.CAD_LAYOUT_SWITCH);

  return (
    <div className="cad-viewer-container">
      <div className="cad-viewer-toolbar">
        <span>ARCOS CAD VIEWER</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {document && (
            <span className="cad-viewer-stats" style={{ fontSize: '0.9em' }}>
              Total: {document.statistics.totalEntities} | 
              {Object.entries(document.statistics.entityTypes)
                .filter(([_, count]) => count > 0)
                .map(([type, count]) => `${type}: ${count}`)
                .join(' | ')}
            </span>
          )}
          {canViewLayouts && document?.layouts && Object.keys(document.layouts).length > 0 && (
            <select
              value={currentSpace.type === 'model' ? 'model' : currentSpace.name}
              onChange={handleSpaceChange}
              disabled={!canSwitchLayout}
              style={{ padding: '4px', background: '#34495e', color: 'white', border: '1px solid #2c3e50', borderRadius: '4px', cursor: canSwitchLayout ? 'pointer' : 'not-allowed' }}
            >
              <option value="model">Modelspace</option>
              {Object.keys(document.layouts).map(lName => (
                <option key={lName} value={lName}>Layout: {lName}</option>
              ))}
            </select>
          )}
          {canViewLayers && (
            <button 
              onClick={() => setShowLayerPanel(!showLayerPanel)} 
              style={{ padding: '4px 10px', background: showLayerPanel ? '#2980b9' : '#34495e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Layers
            </button>
          )}
          {canFit && (
            <button onClick={handleFit} style={{ padding: '4px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Fit to Drawing</button>
          )}
          {onClose && canClose && (
            <button onClick={onClose} style={{ padding: '4px 10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Close Viewer</button>
          )}
        </div>
      </div>
      
      <div className="cad-viewer-canvas-wrapper" ref={containerRef}>
        {/* WebGL Canvas will be injected here by CadRenderer */}
      </div>

      {showLayerPanel && document && canViewLayers && (
        <LayerPanel 
          layers={document.layers}
          visibilityState={layerVisibility}
          onToggleLayer={handleToggleLayer}
          onToggleAll={handleToggleAll}
          onClose={() => setShowLayerPanel(false)}
        />
      )}
    </div>
  );
};

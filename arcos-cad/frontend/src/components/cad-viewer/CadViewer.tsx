import React, { useEffect, useRef, useState } from 'react';
import { CadRenderer } from '../../cad/renderer/CadRenderer';
import type { ArcosCadDocument } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { LayerPanel } from '../layer-panel/LayerPanel';
import { StatisticsPanel } from '../statistics-panel/StatisticsPanel';
import './CadViewer.css';

interface CadViewerProps {
  document: ArcosCadDocument | null;
  onClose?: () => void;
}

export const CadViewer: React.FC<CadViewerProps> = ({ document, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);

  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
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
      // Reset panels when a new file is loaded
      setShowStatsPanel(false);
      setShowLayerPanel(false);
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
        newVis[layer.name] = false;
      }
    });
    setLayerVisibility(newVis);
  };

  // Close stats when clicking layers and vice-versa (optional UX choice — keep both independent)
  const handleToggleStats = () => setShowStatsPanel(prev => !prev);
  const handleToggleLayers = () => setShowLayerPanel(prev => !prev);

  const canFit = hasPermission(PERMISSIONS.CAD_FIT);
  const canClose = hasPermission(PERMISSIONS.CAD_CLOSE);
  const canViewLayers = hasPermission(PERMISSIONS.CAD_LAYERS_VIEW);
  const canViewLayouts = hasPermission(PERMISSIONS.CAD_LAYOUTS_VIEW);
  const canSwitchLayout = hasPermission(PERMISSIONS.CAD_LAYOUT_SWITCH);
  const canViewStats = hasPermission(PERMISSIONS.CAD_STATS_VIEW);

  return (
    <div className="cad-viewer-container">
      {/* ─── Toolbar ─── */}
      <div className="cad-viewer-toolbar">
        <span className="cad-viewer-brand">ARCOS CAD VIEWER</span>

        <div className="cad-viewer-controls">
          {/* Stats toggle — replaces the inline statistics string */}
          {canViewStats && document && (
            <button
              id="cad-stats-btn"
              className={`cad-ctrl-btn${showStatsPanel ? ' cad-ctrl-btn--active' : ''}`}
              onClick={handleToggleStats}
              title="Entity statistics"
            >
              Stats
            </button>
          )}

          {/* Space selector */}
          {canViewLayouts && document?.layouts && Object.keys(document.layouts).length > 0 && (
            <select
              id="cad-space-select"
              className="cad-ctrl-select"
              value={currentSpace.type === 'model' ? 'model' : currentSpace.name}
              onChange={handleSpaceChange}
              disabled={!canSwitchLayout}
            >
              <option value="model">Modelspace</option>
              {Object.keys(document.layouts).map(lName => (
                <option key={lName} value={lName}>Layout: {lName}</option>
              ))}
            </select>
          )}

          {/* Layers toggle */}
          {canViewLayers && (
            <button
              id="cad-layers-btn"
              className={`cad-ctrl-btn${showLayerPanel ? ' cad-ctrl-btn--active' : ''}`}
              onClick={handleToggleLayers}
              title="Layer visibility"
            >
              Layers
            </button>
          )}

          {/* Fit to Drawing */}
          {canFit && (
            <button
              id="cad-fit-btn"
              className="cad-ctrl-btn cad-ctrl-btn--primary"
              onClick={handleFit}
              title="Fit drawing to view"
            >
              Fit
            </button>
          )}

          {/* Close Viewer */}
          {onClose && canClose && (
            <button
              id="cad-close-btn"
              className="cad-ctrl-btn cad-ctrl-btn--danger"
              onClick={onClose}
              title="Close viewer"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* ─── Canvas wrapper — popups are children so they are bounded within ─── */}
      <div className="cad-viewer-canvas-wrapper" ref={containerRef}>
        {/* WebGL Canvas is injected here by CadRenderer */}

        {/* Statistics popup — LEFT side */}
        {showStatsPanel && document && canViewStats && (
          <StatisticsPanel
            document={document}
            onClose={() => setShowStatsPanel(false)}
          />
        )}

        {/* Layers popup — RIGHT side */}
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
    </div>
  );
};

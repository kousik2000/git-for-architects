import React, { useEffect, useRef, useState } from 'react';
import { CadRenderer } from '../../cad/renderer/CadRenderer';
import type { ArcosCadDocument } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { LayerPanel } from '../layer-panel/LayerPanel';
import { StatisticsPanel } from '../statistics-panel/StatisticsPanel';
import { EntityInspectionPanel } from '../entity-inspection/EntityInspectionPanel';
import { HoverTooltip } from '../hover-tooltip/HoverTooltip';
import { resolveInspectionData } from '../../cad/utils/inspection-resolver';
import type { EntityInspection } from '../../cad/types/inspection';
import type { CadConfiguration } from '../../cad/config/CadConfiguration';
import { defaultCadConfiguration } from '../../cad/config/default-cad-configuration';
import { CadSettingsMenu } from '../cad-settings/CadSettingsMenu';
import { MeasurementOverlay } from '../measurement/MeasurementOverlay';
import './CadViewer.css';

interface CadViewerProps {
  document: ArcosCadDocument | null;
  onClose?: () => void;
}

export const CadViewer: React.FC<CadViewerProps> = ({ document, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CadRenderer | null>(null);
  const documentRef = useRef<ArcosCadDocument | null>(null);

  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [currentSpace, setCurrentSpace] = useState<{type: 'model' | 'layout', name?: string}>({type: 'model'});
  const [inspectionData, setInspectionData] = useState<EntityInspection | null>(null);
  
  const [hoverData, setHoverData] = useState<EntityInspection | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Configuration tracking
  const [cadConfig, setCadConfig] = useState<CadConfiguration>(defaultCadConfiguration);
  const hoverInfoEnabledRef = useRef(cadConfig.interaction.hoverInfo);
  
  // Expose measurement controller for overlay
  const [measControllerReady, setMeasControllerReady] = useState(false);

  // Keep ref updated to avoid stale closure
  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  // Initialize renderer on mount
  useEffect(() => {
    if (containerRef.current && !rendererRef.current) {
      rendererRef.current = new CadRenderer(containerRef.current);
      rendererRef.current.onEntitySelected = (reference) => {
        if (hasPermission(PERMISSIONS.CAD_ENTITY_SELECT)) {
          if (reference) {
            console.log(`[CadViewer] Entity Selected:`, reference);
            if (hasPermission(PERMISSIONS.CAD_ENTITY_INSPECT) && documentRef.current) {
              const data = resolveInspectionData(documentRef.current, reference);
              setInspectionData(data);
            }
          } else {
            console.log(`[CadViewer] Selection Cleared`);
            setInspectionData(null);
          }
        }
      };
      
      rendererRef.current.onEntityHovered = (reference, clientX, clientY) => {
        if (!hoverInfoEnabledRef.current || !hasPermission(PERMISSIONS.CAD_ENTITY_INSPECT) || !documentRef.current) {
          setHoverData(null);
          return;
        }
        if (reference) {
          const data = resolveInspectionData(documentRef.current, reference);
          setHoverData(data);
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            setPointerPos({ x: clientX - rect.left, y: clientY - rect.top });
          }
        } else {
          setHoverData(null);
        }
      };
      
      setMeasControllerReady(true);
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
      // Reset panels and selection when a new file is loaded
      setShowStatsPanel(false);
      setShowLayerPanel(false);
      setInspectionData(null);
      setHoverData(null);
    }
  }, [document]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setInteractionConfig(cadConfig.interaction);
    }
  }, [cadConfig.interaction]);

  useEffect(() => {
    if (rendererRef.current) {
      // Pass the snapping config to renderer
      (rendererRef.current as any).setSnappingConfig(cadConfig.snapping);
    }
  }, [cadConfig.snapping]);

  useEffect(() => {
    hoverInfoEnabledRef.current = cadConfig.interaction.hoverInfo;
    if (!cadConfig.interaction.hoverInfo) {
      setHoverData(null);
    }
  }, [cadConfig.interaction.hoverInfo]);

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

  const handleCloseInspection = () => {
    setInspectionData(null);
  };

  const handleMeasureToggle = () => {
    if (rendererRef.current?.measurementController) {
      if (rendererRef.current.measurementController.isActive()) {
        rendererRef.current.measurementController.cancel();
      } else {
        rendererRef.current.measurementController.start();
      }
    }
  };

  const handleMeasureClear = () => {
    if (rendererRef.current?.measurementController) {
      rendererRef.current.measurementController.clearMeasurements();
    }
  };

  useEffect(() => {
    if (!cadConfig.snapping.enabled && rendererRef.current?.measurementController) {
      const mc = rendererRef.current.measurementController;
      if (mc.isActive()) {
        mc.cancel();
      }
      mc.clearMeasurements();
    }
  }, [cadConfig.snapping.enabled]);

  const canFit = hasPermission(PERMISSIONS.CAD_FIT);
  const canClose = hasPermission(PERMISSIONS.CAD_CLOSE);
  const canViewLayers = hasPermission(PERMISSIONS.CAD_LAYERS_VIEW);
  const canViewLayouts = hasPermission(PERMISSIONS.CAD_LAYOUTS_VIEW);
  const canSwitchLayout = hasPermission(PERMISSIONS.CAD_LAYOUT_SWITCH);
  const canViewStats = hasPermission(PERMISSIONS.CAD_STATS_VIEW);
  const canInspect = hasPermission(PERMISSIONS.CAD_ENTITY_INSPECT);

  return (
    <div className="cad-viewer-container">
      {/* ─── Toolbar ─── */}
      <div className="cad-viewer-toolbar">
        <span className="cad-viewer-brand">ARCOS CAD VIEWER</span>

        <div className="cad-viewer-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          
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

          {/* Measure Button */}
          {rendererRef.current?.measurementController && cadConfig.snapping.enabled && (
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                className={`cad-ctrl-btn${rendererRef.current.measurementController.isActive() ? ' cad-ctrl-btn--active' : ''}`}
                onClick={handleMeasureToggle}
                title="Measure Distance"
              >
                Measure
              </button>
              {rendererRef.current.measurementController.getHistory().length > 0 && (
                <button
                  className="cad-ctrl-btn"
                  onClick={handleMeasureClear}
                  title="Clear Measurements"
                >
                  Clear
                </button>
              )}
            </div>
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

          {/* Settings Menu */}
          <CadSettingsMenu config={cadConfig} onConfigChange={setCadConfig} />
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

        {/* Entity Inspection panel — RIGHT side, overlapping slightly with Layers if both open */}
        {inspectionData && canInspect && (
          <EntityInspectionPanel
            data={inspectionData}
            onClose={handleCloseInspection}
          />
        )}
        
        {/* Hover Tooltip */}
        {hoverData && (
          <HoverTooltip
            inspectionData={hoverData}
            x={pointerPos.x}
            y={pointerPos.y}
          />
        )}
        
        {/* Measurement Overlay */}
        {measControllerReady && rendererRef.current && (
          <MeasurementOverlay 
            controller={rendererRef.current.measurementController}
            renderer={rendererRef.current}
            unitSystem={(document as any)?.metadata?.units || document?.units?.name || 'unit'}
          />
        )}
      </div>
    </div>
  );
};

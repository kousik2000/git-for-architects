import React from 'react';
import type { CadLayer } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { AciPalette } from '../../cad/renderer/AciPalette';
import './LayerPanel.css';

interface LayerPanelProps {
  layers: CadLayer[];
  visibilityState: Record<string, boolean>;
  onToggleLayer: (layerName: string, visible: boolean) => void;
  onToggleAll: (visible: boolean) => void;
  onClose: () => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ 
  layers, 
  visibilityState, 
  onToggleLayer, 
  onToggleAll, 
  onClose 
}) => {
  const canToggle = hasPermission(PERMISSIONS.CAD_LAYERS_TOGGLE);

  // Helper to resolve display color
  const getLayerColorHex = (layer: CadLayer) => {
    let colorNum = 0xffffff;
    if (layer.trueColor !== undefined && layer.trueColor !== null) {
      colorNum = layer.trueColor;
    } else if (layer.color !== undefined && layer.color !== null) {
      colorNum = AciPalette[Math.max(0, Math.min(255, layer.color))] || 0xffffff;
    }
    return '#' + colorNum.toString(16).padStart(6, '0');
  };

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">
        <h3>Layers</h3>
        <button className="layer-panel-close" onClick={onClose}>×</button>
      </div>
      
      {canToggle && (
        <div className="layer-panel-actions">
          <button onClick={() => onToggleAll(true)}>Show All</button>
          <button onClick={() => onToggleAll(false)}>Hide All</button>
        </div>
      )}

      <div className="layer-panel-list">
        {layers.map(layer => {
          const isVisible = visibilityState[layer.name] ?? (layer.visible && !layer.frozen);
          const colorHex = getLayerColorHex(layer);
          
          return (
            <div key={layer.name} className="layer-item">
              <label className="layer-label">
                <input 
                  type="checkbox" 
                  checked={isVisible}
                  disabled={!canToggle || layer.frozen}
                  onChange={(e) => onToggleLayer(layer.name, e.target.checked)}
                />
                <span className="layer-color-swatch" style={{ backgroundColor: colorHex }}></span>
                <span className="layer-name">{layer.name}</span>
                {layer.frozen && <span className="layer-status-badge" title="Frozen">❄️</span>}
                {layer.locked && <span className="layer-status-badge" title="Locked">🔒</span>}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
};

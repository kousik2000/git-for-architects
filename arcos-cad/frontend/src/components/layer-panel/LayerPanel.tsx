import React from 'react';
import type { CadLayer } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { AciPalette } from '../../cad/renderer/AciPalette';
import './LayerPanel.css';

interface LayerPanelProps {
  layers: CadLayer[];
  newLayers?: CadLayer[];
  visibilityState: Record<string, boolean>;
  newVisibilityState?: Record<string, boolean>;
  onToggleLayer: (layerName: string, visible: boolean, isNew?: boolean) => void;
  onToggleAll: (visible: boolean, isNew?: boolean) => void;
  onClose: () => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({ 
  layers, 
  newLayers,
  visibilityState, 
  newVisibilityState,
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

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  const renderLayerList = (list: CadLayer[], visState: Record<string, boolean>, isNew: boolean) => (
    <>
      {canToggle && (
        <div className="layer-panel-actions">
          <button onClick={() => onToggleAll(true, isNew)}>Show All</button>
          <button onClick={() => onToggleAll(false, isNew)}>Hide All</button>
        </div>
      )}
      <div className="layer-panel-list" style={newLayers ? { minHeight: '150px' } : {}}>
        {list.map(layer => {
          const isVisible = visState[layer.name] ?? (layer.visible && !layer.frozen);
          const colorHex = getLayerColorHex(layer);
          
          return (
            <div key={layer.name} className="layer-item">
              <label className="layer-label">
                <input 
                  type="checkbox" 
                  checked={isVisible}
                  disabled={!canToggle || layer.frozen}
                  onChange={(e) => onToggleLayer(layer.name, e.target.checked, isNew)}
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
    </>
  );

  return (
    <div
      className="layer-panel"
      onWheel={stopProp}
      style={newLayers ? { 
        maxHeight: '80vh', 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        top: 0,
        right: 0,
        maxWidth: 'none'
      } : {}}
    >
      <div className="layer-panel-header">
        <h3>{newLayers ? 'Overlay Layers' : 'Layers'}</h3>
        <button className="layer-panel-close" onClick={onClose}>×</button>
      </div>
      
      {newLayers ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          <div>
            <div style={{ color: '#85c1e9', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px', marginLeft: '12px', marginRight: '12px' }}>OLD / PREVIOUS</div>
            {renderLayerList(layers, visibilityState, false)}
          </div>
          <div>
            <div style={{ color: '#85c1e9', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px', marginLeft: '12px', marginRight: '12px' }}>NEW / CURRENT</div>
            {renderLayerList(newLayers, newVisibilityState || {}, true)}
          </div>
        </div>
      ) : (
        renderLayerList(layers, visibilityState, false)
      )}
    </div>
  );
};

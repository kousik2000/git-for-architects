import React, { useState, useRef, useEffect } from 'react';
import type { CadConfiguration } from '../../cad/config/CadConfiguration';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import './CadSettingsMenu.css';

interface CadSettingsMenuProps {
  config: CadConfiguration;
  onConfigChange: (newConfig: CadConfiguration) => void;
}

export function hasVisibleSettings(): boolean {
  // Currently, hover settings and snap settings don't have explicit individual permissions 
  // except snap which we linked to CAD_SNAP_VIEW.
  return true; // We assume interaction settings are always visible if the viewer is open
}

export const CadSettingsMenu: React.FC<CadSettingsMenuProps> = ({ config, onConfigChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!hasVisibleSettings()) {
    return null;
  }

  const handleInteractionChange = (key: keyof CadConfiguration['interaction'], value: boolean) => {
    onConfigChange({
      ...config,
      interaction: {
        ...config.interaction,
        pickbox: config.interaction?.pickbox || { enabled: true, sizePixels: 10, borderWidth: 1 },
        crosshair: config.interaction?.crosshair || { enabled: true, horizontalLengthPixels: 100, verticalLengthPixels: 100, lineWidth: 1 },
        [key]: value
      }
    });
  };

  const handlePickboxChange = (key: string, value: any) => {
    onConfigChange({
      ...config,
      interaction: {
        ...config.interaction,
        pickbox: {
          ...(config.interaction.pickbox || { enabled: true, sizePixels: 10, borderWidth: 1 }),
          [key]: value
        }
      }
    });
  };

  const handleCrosshairChange = (key: string, value: any) => {
    onConfigChange({
      ...config,
      interaction: {
        ...config.interaction,
        crosshair: {
          ...(config.interaction.crosshair || { enabled: true, horizontalLengthPixels: 100, verticalLengthPixels: 100, lineWidth: 1 }),
          [key]: value
        }
      }
    });
  };

  const handleSnapChange = (key: keyof CadConfiguration['snapping'], value: any) => {
    onConfigChange({
      ...config,
      snapping: {
        ...config.snapping,
        [key]: value
      }
    });
  };

  const handleSnapTypeChange = (key: keyof CadConfiguration['snapping']['enabledTypes'], value: boolean) => {
    onConfigChange({
      ...config,
      snapping: {
        ...config.snapping,
        enabledTypes: {
          ...config.snapping.enabledTypes,
          [key]: value
        }
      }
    });
  };

  const canSnap = hasPermission(PERMISSIONS.CAD_SNAP_VIEW);

  return (
    <div className="cad-settings-container" ref={containerRef}>
      <button
        className={`cad-ctrl-btn cad-settings-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Settings"
      >
        ⚙
      </button>

      {isOpen && (
        <div className="cad-settings-popover">
          <div className="cad-settings-header">
            Viewer Settings
          </div>
          <div className="cad-settings-body">

            <div className="cad-settings-section">
              <div className="cad-settings-section-title">
                INTERACTION
              </div>
              <label className="cad-settings-row">
                <input
                  type="checkbox"
                  checked={config.interaction.hoverHighlight}
                  onChange={e => handleInteractionChange('hoverHighlight', e.target.checked)}
                  disabled={config.snapping.enabled}
                />
                Hover Highlight
              </label>
              <label className="cad-settings-row">
                <input
                  type="checkbox"
                  checked={config.interaction.hoverInfo}
                  onChange={e => handleInteractionChange('hoverInfo', e.target.checked)}
                  disabled={config.snapping.enabled}
                />
                Show Hover Tooltip
              </label>

              <label className="cad-settings-row">
                <input
                  type="checkbox"
                  checked={config.interaction.selectionOnClick ?? true}
                  onChange={e => handleInteractionChange('selectionOnClick', e.target.checked)}
                  disabled={config.snapping.enabled}
                />
                Select Entity on Click
              </label>
            </div>

            {canSnap && (
              <div className="cad-settings-section">
                <div className="cad-settings-section-title">SNAPPING</div>
                <label className="cad-settings-row">
                  <input
                    type="checkbox"
                    checked={config.snapping.enabled}
                    onChange={e => handleSnapChange('enabled', e.target.checked)}
                  />
                  Snap Enabled
                </label>
                {config.snapping.enabled && (
                  <div className="cad-settings-sub-section">
                    <label className="cad-settings-row cad-settings-numeric-row">
                      <span>Snap Tolerance (px)</span>
                      <input
                        type="number"
                        value={config.snapping.tolerancePixels ?? 10}
                        min={1}
                        max={50}
                        onChange={e => handleSnapChange('tolerancePixels', parseInt(e.target.value) || 10)}
                      />
                    </label>
                    <label className="cad-settings-row cad-settings-numeric-row">
                      <span>Indicator Size (px)</span>
                      <input
                        type="number"
                        value={config.snapping.indicatorSizePixels ?? 10}
                        min={1}
                        max={50}
                        onChange={e => handleSnapChange('indicatorSizePixels', parseInt(e.target.value) || 10)}
                      />
                    </label>
                    <div className="cad-settings-section-title" style={{ marginTop: '8px', fontSize: '11px' }}>SNAP TYPES</div>
                    <label className="cad-settings-row cad-settings-sub-row">
                      <input
                        type="checkbox"
                        checked={config.snapping.enabledTypes.endpoint}
                        onChange={e => handleSnapTypeChange('endpoint', e.target.checked)}
                      />
                      Endpoint
                    </label>
                    <label className="cad-settings-row cad-settings-sub-row">
                      <input
                        type="checkbox"
                        checked={config.snapping.enabledTypes.midpoint}
                        onChange={e => handleSnapTypeChange('midpoint', e.target.checked)}
                      />
                      Midpoint
                    </label>
                    <label className="cad-settings-row cad-settings-sub-row">
                      <input
                        type="checkbox"
                        checked={config.snapping.enabledTypes.center}
                        onChange={e => handleSnapTypeChange('center', e.target.checked)}
                      />
                      Center
                    </label>
                    <label className="cad-settings-row cad-settings-sub-row">
                      <input
                        type="checkbox"
                        checked={config.snapping.enabledTypes.nearest}
                        onChange={e => handleSnapTypeChange('nearest', e.target.checked)}
                      />
                      Nearest
                    </label>
                  </div>
                )}
              </div>
            )}

            <div className="cad-settings-section">
              <div className="cad-settings-section-title">CURSOR</div>

              <div className="cad-settings-section-title" style={{ fontSize: '11px', marginTop: '4px' }}>PICKBOX</div>
              <label className="cad-settings-row">
                <input
                  type="checkbox"
                  checked={config.interaction.pickbox?.enabled ?? true}
                  onChange={e => handlePickboxChange('enabled', e.target.checked)}
                />
                Enable Pickbox
              </label>
              <label className="cad-settings-row cad-settings-numeric-row">
                <span>Size (px)</span>
                <input
                  type="number"
                  value={config.interaction.pickbox?.sizePixels ?? 10}
                  min={1} max={100}
                  onChange={e => handlePickboxChange('sizePixels', parseInt(e.target.value) || 10)}
                />
              </label>

              <div className="cad-settings-section-title" style={{ fontSize: '11px', marginTop: '8px' }}>CROSSHAIR</div>
              <label className="cad-settings-row">
                <input
                  type="checkbox"
                  checked={config.interaction.crosshair?.enabled ?? true}
                  onChange={e => handleCrosshairChange('enabled', e.target.checked)}
                />
                Enable Crosshair
              </label>
              <label className="cad-settings-row cad-settings-numeric-row">
                <span>Horiz Length (px)</span>
                <input
                  type="number"
                  value={config.interaction.crosshair?.horizontalLengthPixels ?? 100}
                  min={10} max={2000}
                  onChange={e => handleCrosshairChange('horizontalLengthPixels', parseInt(e.target.value) || 100)}
                />
              </label>
              <label className="cad-settings-row cad-settings-numeric-row">
                <span>Vert Length (px)</span>
                <input
                  type="number"
                  value={config.interaction.crosshair?.verticalLengthPixels ?? 100}
                  min={10} max={2000}
                  onChange={e => handleCrosshairChange('verticalLengthPixels', parseInt(e.target.value) || 100)}
                />
              </label>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

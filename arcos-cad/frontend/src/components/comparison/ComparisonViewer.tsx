import React, { useState, useMemo } from 'react';
import type { ComparisonSession } from '../../types/cad';
import { CadViewer } from '../cad-viewer/CadViewer';
import { ComparisonNavigationController } from '../../comparison/navigation/ComparisonNavigationController';
import { ChangeList } from './ChangeList';
import { ChangeRegionManager } from '../../comparison/utils/ChangeRegionManager';
import { StatisticsPanel } from '../statistics-panel/StatisticsPanel';
import { LayerPanel } from '../layer-panel/LayerPanel';
import { CadSettingsMenu } from '../cad-settings/CadSettingsMenu';
import type { CadLayer } from '../../types/cad-json';
import { defaultCadConfiguration } from '../../cad/config/default-cad-configuration';

import { TIMING } from '../../comparison/performance/timingLogger';

export function ComparisonViewer({ session, onClose }: { session: ComparisonSession; onClose: () => void }) {
  const summary = session.comparisonResult.summary;
  const navigationControllerRef = React.useRef(new ComparisonNavigationController());
  
  const allChanges = useMemo(() => {
    TIMING.mark('T23');
    if (summary.added === 0 && summary.removed === 0 && summary.modified === 0) {
      TIMING.mark('T24');
      return [];
    }
    const changes = session.comparisonResult.spaces.flatMap((s: any) => s.changes);
    const order: Record<string, number> = { MODIFIED: 1, REMOVED: 2, ADDED: 3, UNCHANGED: 4 };
    const res = changes.filter((c: any) => c.changeType !== 'UNCHANGED').sort((a: any, b: any) => (order[a.changeType] || 9) - (order[b.changeType] || 9));
    TIMING.mark('T24');
    return res;
  }, [session.comparisonResult, summary]);
  const [renderersReady, setRenderersReady] = useState(false);

  React.useEffect(() => {
    const check = setInterval(() => {
       const oldR = navigationControllerRef.current.getOldRenderer();
       const newR = navigationControllerRef.current.getNewRenderer();
       if (oldR && newR && (oldR as any).activeDoc && (newR as any).activeDoc) {
          setRenderersReady(true);
          clearInterval(check);
       }
    }, 100);
    return () => clearInterval(check);
  }, []);

  const comparisonRegions = useMemo(() => {
    const regions = ChangeRegionManager.computeRegions(allChanges, (ref, side) => {
        const renderer = side === 'OLD' ? navigationControllerRef.current.getOldRenderer() : navigationControllerRef.current.getNewRenderer();
        if (!renderer) return null;
        const bounds = renderer.getEntityWorldBounds(ref);
        if (bounds) return bounds;
        return null;
    }, 10.0);
    
    console.log('[CHANGE REGIONS]');
    console.log('total changes:', allChanges.length);
    console.log('added:', summary.added);
    console.log('removed:', summary.removed);
    console.log('modified:', summary.modified);
    console.log('generated regions:', regions.length);
    for (let i = 0; i < Math.min(10, regions.length); i++) {
        const r = regions[i];
        console.log(`region ${i}:`, r.id, 
            'bounds:', r.bounds, 
            'width:', r.bounds.maxX - r.bounds.minX, 
            'height:', r.bounds.maxY - r.bounds.minY,
            'changeCount:', r.changes.length,
            'added:', r.summary.added,
            'removed:', r.summary.removed,
            'modified:', r.summary.modified
        );
    }
    return regions;
  }, [allChanges, renderersReady]);

  React.useEffect(() => {
    setTimeout(() => {
      TIMING.mark('T25');
      TIMING.report();
    }, 500); // Allow time for child renders
  }, []);

  const [selectedChangeIndex, setSelectedChangeIndex] = useState<number | null>(null);
  const [fullscreenPane, setFullscreenPane] = useState<'none' | 'old' | 'new'>('none');
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay'>('side-by-side');

  // Overlay Header States
  const [showOverlayStats, setShowOverlayStats] = useState(false);
  const [showOverlayLayers, setShowOverlayLayers] = useState(false);

  const [overlayOldLayerVisibility, setOverlayOldLayerVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    session.oldCadJson.layers?.forEach((l: CadLayer) => init[l.name] = l.visible && !l.frozen);
    return init;
  });

  const [overlayNewLayerVisibility, setOverlayNewLayerVisibility] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    session.newCadJson.layers?.forEach((l: CadLayer) => init[l.name] = l.visible && !l.frozen);
    return init;
  });


  const handleToggleOldLayer = (layerName: string, visible: boolean) => {
    setOverlayOldLayerVisibility(prev => ({ ...prev, [layerName]: visible }));
    navigationControllerRef.current.getOldRenderer()?.setLayerVisibility(layerName, visible);
  };

  const handleToggleNewLayer = (layerName: string, visible: boolean) => {
    setOverlayNewLayerVisibility(prev => ({ ...prev, [layerName]: visible }));
    navigationControllerRef.current.getNewRenderer()?.setLayerVisibility(layerName, visible);
  };

  const handleToggleAllOldLayers = (visible: boolean) => {
    const newVis: Record<string, boolean> = {};
    session.oldCadJson.layers?.forEach((l: CadLayer) => {
      if (!l.frozen) {
        newVis[l.name] = visible;
        navigationControllerRef.current.getOldRenderer()?.setLayerVisibility(l.name, visible);
      } else {
        newVis[l.name] = false;
      }
    });
    setOverlayOldLayerVisibility(newVis);
  };

  const handleToggleAllNewLayers = (visible: boolean) => {
    const newVis: Record<string, boolean> = {};
    session.newCadJson.layers?.forEach((l: CadLayer) => {
      if (!l.frozen) {
        newVis[l.name] = visible;
        navigationControllerRef.current.getNewRenderer()?.setLayerVisibility(l.name, visible);
      } else {
        newVis[l.name] = false;
      }
    });
    setOverlayNewLayerVisibility(newVis);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenPane('none');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Recalculate dimensions and sync layout when view mode or fullscreen changes
  React.useEffect(() => {
    setTimeout(() => {
      (navigationControllerRef.current.getOldRenderer() as any)?.handleResize();
      (navigationControllerRef.current.getNewRenderer() as any)?.handleResize();
    }, 50);
  }, [viewMode, fullscreenPane]);

  React.useEffect(() => {
    if (viewMode !== 'overlay') return;
    const oldContainer = navigationControllerRef.current.getOldRenderer()?.getContainer();
    const newContainer = navigationControllerRef.current.getNewRenderer()?.getContainer();
    if (!oldContainer || !newContainer) return;

    const forwardEvent = (e: Event) => {
      if ((e as any)._forwarded) return;
      let clone: any;
      if (e instanceof PointerEvent) {
        clone = new PointerEvent(e.type, e);
      } else if (e instanceof WheelEvent) {
        clone = new WheelEvent(e.type, e);
      } else {
        return;
      }
      clone._forwarded = true;
      oldContainer.dispatchEvent(clone);
    };

    newContainer.addEventListener('pointermove', forwardEvent);
    newContainer.addEventListener('pointerdown', forwardEvent);
    newContainer.addEventListener('pointerup', forwardEvent);
    newContainer.addEventListener('pointercancel', forwardEvent);
    newContainer.addEventListener('pointerleave', forwardEvent);
    newContainer.addEventListener('wheel', forwardEvent, { passive: false });

    return () => {
      newContainer.removeEventListener('pointermove', forwardEvent);
      newContainer.removeEventListener('pointerdown', forwardEvent);
      newContainer.removeEventListener('pointerup', forwardEvent);
      newContainer.removeEventListener('pointercancel', forwardEvent);
      newContainer.removeEventListener('pointerleave', forwardEvent);
      newContainer.removeEventListener('wheel', forwardEvent);
    };
  }, [viewMode]);

  const handleSelectChange = (index: number | null) => {
    setSelectedChangeIndex(index);
    if (index !== null) {
      const change = allChanges[index];
      navigationControllerRef.current.focusOnChange(change, session.oldCadJson, session.newCadJson);
    } else {
      navigationControllerRef.current.clearChangeFocus();
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 1000, backgroundColor: '#1e1e1e', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* HEADER */}
      <div style={{ 
        height: '60px', 
        background: '#2c3e50', 
        color: 'white', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 1rem', 
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            Comparison Result
          </h2>
          <div style={{ display: 'flex', gap: '1rem', background: '#34495e', padding: '0.3rem 1rem', borderRadius: '4px', fontSize: '0.9rem' }}>
            <span style={{ color: '#2ecc71' }}>Added: {summary.added}</span>
            <span style={{ color: '#e74c3c' }}>Removed: {summary.removed}</span>
            <span style={{ color: '#f1c40f' }}>Modified: {summary.modified}</span>
            <span style={{ color: '#bdc3c7' }}>Unchanged: {summary.unchanged}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', padding: '0.3rem 1rem', fontSize: '0.85rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#e74c3c', display: 'inline-block' }}></span> 
              RED = Removed
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#2ecc71', display: 'inline-block' }}></span> 
              GREEN = Added
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f1c40f', display: 'inline-block' }}></span> 
              YELLOW = Modified
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', background: '#34495e', padding: '0.2rem', borderRadius: '4px' }}>
            <button 
              onClick={() => setViewMode('side-by-side')}
              style={{ background: viewMode === 'side-by-side' ? '#3498db' : 'transparent', border: 'none', color: 'white', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Side by Side
            </button>
            <button 
              onClick={() => {
                setViewMode('overlay');
                setTimeout(() => {
                  navigationControllerRef.current.fitToCombinedBounds();
                }, 50);
              }}
              style={{ background: viewMode === 'overlay' ? '#3498db' : 'transparent', border: 'none', color: 'white', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Overlay
            </button>
          </div>

        </div>
        <button 
          onClick={onClose} 
          style={{ background: 'transparent', border: '1px solid white', color: 'white', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
        >
          Close Comparison
        </button>
      </div>

      {/* PANES */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
        
        {/* CAD VIEWERS (Left) */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative', flexDirection: viewMode === 'overlay' ? 'column' : 'row' }}>
          
          {viewMode === 'overlay' && (
            <>
              {/* Overlay File Context Header */}
              <div style={{ background: '#ecf0f1', padding: '0.5rem 1rem', borderBottom: '1px solid #bdc3c7', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <span>Comparison Overlay</span>
                  <span style={{ color: '#7f8c8d', fontSize: '0.9rem', marginLeft: '0.5rem' }}>{session.oldFileName} vs {session.newFileName}</span>
                </div>
                <button 
                  onClick={() => setFullscreenPane(fullscreenPane === 'old' ? 'none' : 'old')}
                  style={{ background: 'white', border: '1px solid #bdc3c7', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  {fullscreenPane === 'old' ? 'Exit Full View' : 'Full View'}
                </button>
              </div>

              {/* Overlay CAD Viewer Header */}
              <div className="cad-viewer-header" style={{ position: 'relative', zIndex: 10, flexShrink: 0 }}>
                <div className="cad-viewer-toolbar">
                  <div className="cad-viewer-brand" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                    ARCOS CAD VIEWER
                  </div>
                  <div className="cad-viewer-controls">
                    {session.newCadJson.layouts && Object.keys(session.newCadJson.layouts).length > 0 && (
                      <select
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #555', background: '#3a3a3a', color: '#ddd', fontSize: '12px' }}
                        onChange={(e) => {
                          const space = e.target.value;
                          navigationControllerRef.current.getOldRenderer()?.renderSpace(space === 'model' ? 'model' : 'layout', space === 'model' ? undefined : space);
                          navigationControllerRef.current.getNewRenderer()?.renderSpace(space === 'model' ? 'model' : 'layout', space === 'model' ? undefined : space);
                        }}
                      >
                        <option value="model">Modelspace</option>
                        {Object.keys(session.newCadJson.layouts).map(lName => (
                          <option key={lName} value={lName}>Layout: {lName}</option>
                        ))}
                      </select>
                    )}
                    <button 
                      onClick={() => {
                        setShowOverlayStats(!showOverlayStats);
                        if (!showOverlayStats) setShowOverlayLayers(false);
                      }} 
                      className={`cad-ctrl-btn${showOverlayStats ? ' cad-ctrl-btn--active' : ''}`} 
                      style={{ background: showOverlayStats ? '#555' : '' }}
                    >
                      Stats
                    </button>
                    <button 
                      onClick={() => {
                        setShowOverlayLayers(!showOverlayLayers);
                        if (!showOverlayLayers) setShowOverlayStats(false);
                      }} 
                      className={`cad-ctrl-btn${showOverlayLayers ? ' cad-ctrl-btn--active' : ''}`} 
                      style={{ background: showOverlayLayers ? '#555' : '' }}
                    >
                      Layers
                    </button>
                    <button onClick={() => navigationControllerRef.current.fitToCombinedBounds()} className="cad-ctrl-btn">Fit</button>
                    <button onClick={() => {}} className="cad-ctrl-btn" style={{ opacity: 0.5 }}>Settings</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Canvas Wrapper */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: viewMode === 'overlay' ? 'column' : 'row', minWidth: 0, minHeight: 0 }}>
            
            {/* OVERLAY POPUPS (Moved into Canvas Wrapper to be correctly positioned over canvases) */}
            {viewMode === 'overlay' && showOverlayStats && (
              <div 
                style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10 }}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onPointerMove={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <StatisticsPanel 
                  document={session.oldCadJson} 
                  newDocument={session.newCadJson}
                  onClose={() => setShowOverlayStats(false)} 
                />
              </div>
            )}
            {viewMode === 'overlay' && showOverlayLayers && (
              <div 
                style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10 }}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onPointerMove={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <LayerPanel 
                  layers={session.oldCadJson.layers || []}
                  newLayers={session.newCadJson.layers || []}
                  visibilityState={overlayOldLayerVisibility}
                  newVisibilityState={overlayNewLayerVisibility}
                  onToggleLayer={(name, vis, isNew) => {
                    if (isNew) handleToggleNewLayer(name, vis);
                    else handleToggleOldLayer(name, vis);
                  }}
                  onToggleAll={(vis, isNew) => {
                    if (isNew) handleToggleAllNewLayers(vis);
                    else handleToggleAllOldLayers(vis);
                  }}
                  onClose={() => setShowOverlayLayers(false)}
                />
              </div>
            )}

            {/* OLD PANE */}
            <div style={{ 
              flex: viewMode === 'overlay' ? 'none' : (fullscreenPane === 'old' ? '1 1 100%' : '1 1 0'), 
              width: viewMode === 'overlay' ? '100%' : 'auto', 
              minWidth: 0, 
              overflow: 'hidden',
              borderRight: (viewMode === 'overlay' || fullscreenPane === 'old') ? 'none' : '2px solid #34495e', 
              display: fullscreenPane === 'new' ? 'none' : 'flex', 
              flexDirection: 'column', 
              position: viewMode === 'overlay' ? 'absolute' : 'relative',
              inset: viewMode === 'overlay' ? 0 : 'auto',
              zIndex: 1
            }}>
              {viewMode !== 'overlay' && (
                <div style={{ background: '#ecf0f1', padding: '0.5rem 1rem', borderBottom: '1px solid #bdc3c7', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span>Previous / Old</span>
                    <span style={{ color: '#7f8c8d', fontSize: '0.9rem', marginLeft: '0.5rem' }}>{session.oldFileName}</span>
                  </div>
                  <button 
                    onClick={() => setFullscreenPane(fullscreenPane === 'old' ? 'none' : 'old')}
                    style={{ background: 'white', border: '1px solid #bdc3c7', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    {fullscreenPane === 'old' ? 'Exit Full View' : 'Full View'}
                  </button>
                </div>
              )}
              <div style={{ flex: 1, position: 'relative' }}>
                <CadViewer 
                  document={session.oldCadJson} 
                  comparisonChanges={allChanges}
                  comparisonRegions={comparisonRegions}
                  comparisonSide="OLD"
                  navigationController={navigationControllerRef.current}
                  transparentBackground={false}
                  hideHeader={viewMode === 'overlay'}
                />
              </div>
            </div>

            {/* NEW PANE */}
            <div style={{ 
              flex: viewMode === 'overlay' ? 'none' : (fullscreenPane === 'new' ? '1 1 100%' : '1 1 0'), 
              width: viewMode === 'overlay' ? '100%' : 'auto', 
              minWidth: 0, 
              overflow: 'hidden',
              display: fullscreenPane === 'old' ? 'none' : 'flex', 
              flexDirection: 'column', 
              position: viewMode === 'overlay' ? 'absolute' : 'relative',
              inset: viewMode === 'overlay' ? 0 : 'auto',
              zIndex: 2,
              opacity: viewMode === 'overlay' ? 0.8 : 1 // Opacity for base geometry overlap visibility
            }}>
              {viewMode !== 'overlay' && (
                <div style={{ background: '#ecf0f1', padding: '0.5rem 1rem', borderBottom: '1px solid #bdc3c7', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span>Current / New</span>
                    <span style={{ color: '#7f8c8d', fontSize: '0.9rem', marginLeft: '0.5rem' }}>{session.newFileName}</span>
                  </div>
                  <button 
                    onClick={() => setFullscreenPane(fullscreenPane === 'new' ? 'none' : 'new')}
                    style={{ background: 'white', border: '1px solid #bdc3c7', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    {fullscreenPane === 'new' ? 'Exit Full View' : 'Full View'}
                  </button>
                </div>
              )}
              <div style={{ flex: 1, position: 'relative' }}>
                <CadViewer 
                  document={session.newCadJson} 
                  onClose={() => {}} 
                  comparisonChanges={allChanges}
                  comparisonRegions={comparisonRegions}
                  comparisonSide="NEW"
                  navigationController={navigationControllerRef.current}
                  transparentBackground={viewMode === 'overlay'}
                  hideHeader={viewMode === 'overlay'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* CHANGE LIST (Right) */}
        <div style={{ 
          width: '300px', 
          flexShrink: 0, 
          borderLeft: '2px solid #34495e', 
          display: fullscreenPane !== 'none' ? 'none' : 'flex', 
          flexDirection: 'column' 
        }}>
          <ChangeList 
            changes={allChanges} 
            selectedIndex={selectedChangeIndex} 
            onSelectChange={handleSelectChange} 
          />
        </div>
      </div>

    </div>
  );
}

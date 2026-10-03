import React, { useState, useMemo } from 'react';
import type { ComparisonSession } from '../../types/cad';
import { CadViewer } from '../cad-viewer/CadViewer';
import { ComparisonNavigationController } from '../../comparison/navigation/ComparisonNavigationController';
import { ChangeList } from './ChangeList';
import { ChangeRegionManager } from '../../comparison/utils/ChangeRegionManager';

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

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenPane('none');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


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
          {viewMode === 'overlay' && (
            <div style={{ display: 'flex', gap: '0.5rem', background: '#34495e', padding: '0.2rem', borderRadius: '4px' }}>
              {session.newCadJson.layouts && Object.keys(session.newCadJson.layouts).length > 0 && (
                <select
                  style={{ background: 'transparent', color: 'white', border: '1px solid #bdc3c7', borderRadius: '4px', padding: '0.2rem 0.5rem' }}
                  onChange={(e) => {
                    const space = e.target.value;
                    navigationControllerRef.current.getOldRenderer()?.setCurrentSpace(space === 'model' ? {type: 'model'} : {type: 'layout', name: space});
                    navigationControllerRef.current.getNewRenderer()?.setCurrentSpace(space === 'model' ? {type: 'model'} : {type: 'layout', name: space});
                  }}
                >
                  <option value="model" style={{ color: 'black' }}>Modelspace</option>
                  {Object.keys(session.newCadJson.layouts).map(lName => (
                    <option key={lName} value={lName} style={{ color: 'black' }}>Layout: {lName}</option>
                  ))}
                </select>
              )}
              <button 
                onClick={() => navigationControllerRef.current.fitToCombinedBounds()}
                style={{ background: 'transparent', border: '1px solid #bdc3c7', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Fit
              </button>
              <button 
                onClick={() => setFullscreenPane(fullscreenPane === 'new' ? 'none' : 'new')}
                style={{ background: 'transparent', border: '1px solid #bdc3c7', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {fullscreenPane === 'new' ? 'Exit Full View' : 'Full View'}
              </button>
            </div>
          )}
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
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
          {/* OLD PANE */}
          <div style={{ 
            flex: viewMode === 'overlay' ? 'none' : 1, 
            width: viewMode === 'overlay' ? '100%' : (fullscreenPane === 'old' ? '100%' : '50%'), 
            minWidth: 0, 
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
              {/* The underlying CadViewer handles its own full size relative to its parent container. We pass a no-op onClose because the header handles it. */}
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
            flex: viewMode === 'overlay' ? 'none' : 1, 
            width: viewMode === 'overlay' ? '100%' : (fullscreenPane === 'new' ? '100%' : '50%'), 
            minWidth: 0, 
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

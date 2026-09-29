import React, { useState, useMemo } from 'react';
import type { ComparisonSession } from '../../types/cad';
import { CadViewer } from '../cad-viewer/CadViewer';
import { ComparisonNavigationController } from '../../comparison/navigation/ComparisonNavigationController';
import { ChangeList } from './ChangeList';

export function ComparisonViewer({ session, onClose }: { session: ComparisonSession; onClose: () => void }) {
  const summary = session.comparisonResult.summary;
  
  const allChanges = useMemo(() => {
    const changes = session.comparisonResult.spaces.flatMap(s => s.changes);
    const order: Record<string, number> = { MODIFIED: 1, REMOVED: 2, ADDED: 3, UNCHANGED: 4 };
    return changes.filter(c => c.changeType !== 'UNCHANGED').sort((a, b) => (order[a.changeType] || 9) - (order[b.changeType] || 9));
  }, [session.comparisonResult]);

  const [selectedChangeIndex, setSelectedChangeIndex] = useState<number | null>(null);

  const navigationControllerRef = React.useRef(new ComparisonNavigationController());

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
              RED = Removed/Modified
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#2ecc71', display: 'inline-block' }}></span> 
              GREEN = Added/Modified
            </span>
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
        <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
          {/* OLD PANE */}
          <div style={{ flex: 1, width: '50%', minWidth: 0, borderRight: '2px solid #34495e', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ background: '#ecf0f1', padding: '0.5rem 1rem', borderBottom: '1px solid #bdc3c7', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
              <span>Previous / Old</span>
              <span style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>{session.oldFileName}</span>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              {/* The underlying CadViewer handles its own full size relative to its parent container. We pass a no-op onClose because the header handles it. */}
              <CadViewer 
                document={session.oldCadJson} 
                onClose={() => {}} 
                comparisonChanges={allChanges}
                comparisonSide="OLD"
                navigationController={navigationControllerRef.current}
              />
            </div>
          </div>

          {/* NEW PANE */}
          <div style={{ flex: 1, width: '50%', minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ background: '#ecf0f1', padding: '0.5rem 1rem', borderBottom: '1px solid #bdc3c7', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
              <span>Current / New</span>
              <span style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>{session.newFileName}</span>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <CadViewer 
                document={session.newCadJson} 
                onClose={() => {}} 
                comparisonChanges={allChanges}
                comparisonSide="NEW"
                navigationController={navigationControllerRef.current}
              />
            </div>
          </div>
        </div>

        {/* CHANGE LIST (Right) */}
        <div style={{ width: '300px', flexShrink: 0, borderLeft: '2px solid #34495e', display: 'flex', flexDirection: 'column' }}>
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

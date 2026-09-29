import React, { useState, useEffect } from 'react';
import type { ComparisonChange } from '../../comparison/types/comparison-types';

export interface ChangeListProps {
  changes: ComparisonChange[];
  selectedIndex: number | null;
  onSelectChange: (index: number | null) => void;
}

export function ChangeList({ changes, selectedIndex, onSelectChange }: ChangeListProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 50;
  
  const totalPages = Math.ceil(changes.length / itemsPerPage);

  // Sync page when selectedIndex changes externally (e.g. via Next/Prev outside or wrap-around)
  useEffect(() => {
    if (selectedIndex !== null && changes.length > 0) {
      const requiredPage = Math.floor(selectedIndex / itemsPerPage);
      if (requiredPage !== currentPage) {
        setCurrentPage(requiredPage);
      }
    }
  }, [selectedIndex, itemsPerPage, changes.length]);

  if (changes.length === 0) {
    return (
      <div style={{ padding: '1rem', color: '#7f8c8d' }}>
        No changes detected.
      </div>
    );
  }

  const handlePrevPage = () => setCurrentPage(p => Math.max(0, p - 1));
  const handleNextPage = () => setCurrentPage(p => Math.min(totalPages - 1, p + 1));

  const handlePrevChange = () => {
    if (changes.length === 0) return;
    if (selectedIndex === null) {
      onSelectChange(changes.length - 1);
    } else {
      const prev = selectedIndex - 1;
      onSelectChange(prev < 0 ? changes.length - 1 : prev); // wrap around
    }
  };

  const handleNextChange = () => {
    if (changes.length === 0) return;
    if (selectedIndex === null) {
      onSelectChange(0);
    } else {
      const next = selectedIndex + 1;
      onSelectChange(next >= changes.length ? 0 : next); // wrap around
    }
  };

  const visibleChanges = changes.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  const getChangeColor = (type: string) => {
    if (type === 'REMOVED') return '#e74c3c';
    if (type === 'ADDED') return '#2ecc71';
    if (type === 'MODIFIED') return '#f1c40f';
    return '#bdc3c7';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#2c3e50', color: 'white' }}>
      
      {/* List Header & Controls */}
      <div style={{ padding: '0.5rem', borderBottom: '1px solid #34495e', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '1.1rem' }}>Changes ({changes.length})</strong>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handlePrevChange} title="Previous Change" style={btnStyle}>&larr;</button>
            <button onClick={handleNextChange} title="Next Change" style={btnStyle}>&rarr;</button>
          </div>
        </div>
        
        {selectedIndex !== null && (
          <div style={{ fontSize: '0.9rem', color: '#bdc3c7' }}>
            Selected: {selectedIndex + 1} / {changes.length}
          </div>
        )}
      </div>

      {/* List Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {visibleChanges.map((change, idx) => {
          const globalIndex = currentPage * itemsPerPage + idx;
          const isSelected = globalIndex === selectedIndex;
          const ref = change.oldEntity || change.newEntity;
          const layer = ref?.layer || 'Unknown';
          const space = ref?.space || 'model';
          const type = change.entityType || 'Entity';

          return (
            <div 
              key={globalIndex}
              onClick={() => onSelectChange(globalIndex)}
              style={{
                background: isSelected ? '#34495e' : 'transparent',
                border: `1px solid ${isSelected ? '#3498db' : '#34495e'}`,
                borderLeft: `4px solid ${getChangeColor(change.changeType)}`,
                padding: '0.5rem',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '0.85rem'
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '4px', color: getChangeColor(change.changeType) }}>
                {change.changeType}
              </div>
              <div style={{ color: '#ecf0f1' }}>{type} • Layer: {layer}</div>
              <div style={{ color: '#bdc3c7', fontSize: '0.75rem', marginTop: '2px' }}>Space: {space}</div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ padding: '0.5rem', borderTop: '1px solid #34495e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
          <button onClick={handlePrevPage} disabled={currentPage === 0} style={btnStyle}>Prev Page</button>
          <span>Page {currentPage + 1} of {totalPages}</span>
          <button onClick={handleNextPage} disabled={currentPage === totalPages - 1} style={btnStyle}>Next Page</button>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: '#34495e',
  color: 'white',
  border: '1px solid #7f8c8d',
  padding: '0.3rem 0.6rem',
  borderRadius: '4px',
  cursor: 'pointer'
};

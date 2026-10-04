import React from 'react';
import type { ArcosCadDocument } from '../../types/cad-json';
import './StatisticsPanel.css';

interface StatisticsPanelProps {
  document: ArcosCadDocument;
  newDocument?: ArcosCadDocument;
  onClose: () => void;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ document, newDocument, onClose }) => {
  const renderStatsBody = (stats: ArcosCadDocument['statistics']) => {
    const entityEntries = Object.entries(stats.entityTypes).filter(([, count]) => count > 0);
    return (
      <>
        <div className="stats-total-row">
          <span className="stats-label">Total Entities</span>
          <span className="stats-value">{stats.totalEntities.toLocaleString()}</span>
        </div>
        <div className="stats-divider" />
        <div className="stats-list">
          {entityEntries.map(([type, count]) => (
            <div key={type} className="stats-row">
              <span className="stats-type">{type}</span>
              <span className="stats-count">{(count as number).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </>
    );
  };

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="stats-panel"
      role="dialog"
      aria-label="Entity Statistics"
      onWheel={stopProp}
      style={newDocument ? { 
        maxHeight: '80vh', 
        display: 'flex', 
        flexDirection: 'column',
        position: 'relative',
        top: 0,
        left: 0,
        maxWidth: 'none'
      } : {}}
    >
      <div className="stats-panel-header">
        <h3>{newDocument ? 'Overlay Statistics' : 'Statistics'}</h3>
        <button className="stats-panel-close" onClick={onClose} aria-label="Close statistics">×</button>
      </div>

      <div className="stats-panel-body">
        {newDocument ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ color: '#85c1e9', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>OLD / PREVIOUS</div>
              {renderStatsBody(document.statistics)}
            </div>
            <div>
              <div style={{ color: '#85c1e9', fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>NEW / CURRENT</div>
              {renderStatsBody(newDocument.statistics)}
            </div>
          </div>
        ) : (
          renderStatsBody(document.statistics)
        )}
      </div>
    </div>
  );
};

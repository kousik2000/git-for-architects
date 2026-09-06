import React from 'react';
import type { ArcosCadDocument } from '../../types/cad-json';
import './StatisticsPanel.css';

interface StatisticsPanelProps {
  document: ArcosCadDocument;
  onClose: () => void;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ document, onClose }) => {
  const { statistics } = document;

  // Filter to entity types that actually appear in this DXF
  const entityEntries = Object.entries(statistics.entityTypes).filter(([, count]) => count > 0);

  const stopProp = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="stats-panel"
      role="dialog"
      aria-label="Entity Statistics"
      onWheel={stopProp}
    >
      <div className="stats-panel-header">
        <h3>Statistics</h3>
        <button className="stats-panel-close" onClick={onClose} aria-label="Close statistics">×</button>
      </div>

      <div className="stats-panel-body">
        <div className="stats-total-row">
          <span className="stats-label">Total Entities</span>
          <span className="stats-value">{statistics.totalEntities.toLocaleString()}</span>
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
      </div>
    </div>
  );
};

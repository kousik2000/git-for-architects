import type { EntityInspection } from '../../cad/types/inspection';
import './HoverTooltip.css';

interface HoverTooltipProps {
  inspectionData: EntityInspection;
  x: number;
  y: number;
}

export function HoverTooltip({ inspectionData, x, y }: HoverTooltipProps) {
  return (
    <div 
      className="arcos-hover-tooltip"
      style={{
        left: x + 15,
        top: y + 15
      }}
    >
      <div className="tooltip-header">
        {inspectionData.entityType}
      </div>
      <div className="tooltip-body">
        {inspectionData.changeStatus && inspectionData.changeStatus !== 'UNCHANGED' && inspectionData.entityType !== 'CHANGE_REGION' && (
          <div className="tooltip-row">
            <span className="tooltip-label">Status:</span>
            <span className="tooltip-value" style={{ fontWeight: 'bold' }}>{inspectionData.changeStatus}</span>
          </div>
        )}
        {inspectionData.entityType === 'CHANGE_REGION' && (inspectionData as any).regionSummary && (
          <>
            <div className="tooltip-row">
              <span className="tooltip-label">Added:</span>
              <span className="tooltip-value" style={{ color: '#2ecc71', fontWeight: 'bold' }}>{(inspectionData as any).regionSummary.added}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Removed:</span>
              <span className="tooltip-value" style={{ color: '#e74c3c', fontWeight: 'bold' }}>{(inspectionData as any).regionSummary.removed}</span>
            </div>
            <div className="tooltip-row">
              <span className="tooltip-label">Modified:</span>
              <span className="tooltip-value" style={{ color: '#f1c40f', fontWeight: 'bold' }}>{(inspectionData as any).regionSummary.modified}</span>
            </div>
          </>
        )}
        <div className="tooltip-row">
          <span className="tooltip-label">Layer:</span>
          <span className="tooltip-value">{inspectionData.layer}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Handle:</span>
          <span className="tooltip-value">{inspectionData.entityId}</span>
        </div>
      </div>
    </div>
  );
}

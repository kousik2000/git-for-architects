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

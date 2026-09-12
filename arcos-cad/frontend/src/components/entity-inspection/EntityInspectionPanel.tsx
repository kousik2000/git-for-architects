import React from 'react';
import type { EntityInspection } from '../../cad/types/inspection';
import './EntityInspectionPanel.css';

interface Props {
  data: EntityInspection;
  onClose: () => void;
}

export const EntityInspectionPanel: React.FC<Props> = ({ data, onClose }) => {
  const renderRow = (label: string, value: string | number | boolean | undefined) => {
    if (value === undefined) return <div className="cad-ins-row"><span className="cad-ins-label">{label}</span><span className="cad-ins-val cad-ins-na">Not available</span></div>;
    return <div className="cad-ins-row"><span className="cad-ins-label">{label}</span><span className="cad-ins-val">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}</span></div>;
  };

  const renderVector3 = (label: string, vec?: [number, number, number]) => {
    if (!vec) return renderRow(label, undefined);
    return renderRow(label, `${vec[0].toFixed(3)}, ${vec[1].toFixed(3)}, ${vec[2].toFixed(3)}`);
  };

  return (
    <div className="cad-inspection-panel">
      <div className="cad-ins-header">
        <div className="cad-ins-title">
          <span className="cad-ins-type">{data.entityType}</span>
          <span className="cad-ins-handle">#{data.entityId}</span>
        </div>
        <button className="cad-ins-close" onClick={onClose} title="Close Inspection">✕</button>
      </div>

      <div className="cad-ins-content">
        <div className="cad-ins-section">
          <div className="cad-ins-section-title">GENERAL</div>
          {renderRow('Layer', data.layer)}
          {renderRow('Space', data.space === 'layout' ? 'Layout' : 'Model')}
        </div>

        <div className="cad-ins-section">
          <div className="cad-ins-section-title">GEOMETRY</div>
          {data.entityType === 'LINE' && (
            <>
              {renderVector3('Start', (data as any).start)}
              {renderVector3('End', (data as any).end)}
              {renderRow('Length', (data as any).length?.toFixed(4))}
              {renderRow('Angle', (data as any).angle !== undefined ? `${(data as any).angle.toFixed(2)}°` : undefined)}
            </>
          )}
          {data.entityType === 'LWPOLYLINE' && (
            <>
              {renderRow('Vertices', (data as any).vertexCount)}
              {renderRow('Closed', (data as any).closed)}
              {renderRow('Elevation', (data as any).elevation)}
            </>
          )}
          {data.entityType === 'CIRCLE' && (
            <>
              {renderVector3('Center', (data as any).center)}
              {renderRow('Radius', (data as any).radius.toFixed(4))}
              {renderRow('Diameter', (data as any).diameter?.toFixed(4))}
            </>
          )}
          {data.entityType === 'ARC' && (
            <>
              {renderVector3('Center', (data as any).center)}
              {renderRow('Radius', (data as any).radius.toFixed(4))}
              {renderRow('Start Angle', (data as any).startAngle !== undefined ? `${(data as any).startAngle.toFixed(2)}°` : undefined)}
              {renderRow('End Angle', (data as any).endAngle !== undefined ? `${(data as any).endAngle.toFixed(2)}°` : undefined)}
            </>
          )}
          {data.entityType === 'SPLINE' && (
            <>
              {renderRow('Degree', (data as any).degree)}
              {renderRow('Rational', (data as any).rational)}
              {renderRow('Periodic', (data as any).periodic)}
              {renderRow('Control Points', (data as any).controlPointCount)}
              {renderRow('Fit Points', (data as any).fitPointCount)}
            </>
          )}
          {(data.entityType === 'TEXT' || data.entityType === 'MTEXT') && (
            <>
              {renderVector3('Position', (data as any).position)}
              {renderRow('Height', (data as any).height?.toFixed(4))}
              {renderRow('Rotation', (data as any).rotation !== undefined ? `${(data as any).rotation.toFixed(2)}°` : undefined)}
            </>
          )}
          {data.entityType === 'HATCH' && (
            <>
              {renderRow('Pattern', (data as any).patternName)}
              {renderRow('Boundaries', (data as any).boundaryPathCount)}
            </>
          )}
          {data.entityType === 'INSERT' && (
            <>
              {renderRow('Block', (data as any).blockName)}
              {renderVector3('Position', (data as any).position)}
              {renderRow('Rotation', (data as any).rotation !== undefined ? `${(((data as any).rotation * 180) / Math.PI).toFixed(2)}°` : undefined)}
              {renderVector3('Scale', (data as any).scale)}
            </>
          )}
        </div>

        {(data.entityType === 'TEXT' || data.entityType === 'MTEXT') && (
          <div className="cad-ins-section">
            <div className="cad-ins-section-title">CONTENT</div>
            <div className="cad-ins-text-content">{(data as any).text || <span className="cad-ins-na">Not available</span>}</div>
          </div>
        )}

        <div className="cad-ins-section">
          <div className="cad-ins-section-title">APPEARANCE</div>
          {renderRow('Color', data.color)}
          {renderRow('Linetype', data.linetype)}
          {renderRow('Lineweight', data.lineweight)}
        </div>

        {(data.insertPath.length > 0 || data.viewportId) && (
          <div className="cad-ins-section">
            <div className="cad-ins-section-title">CONTEXT</div>
            {data.insertPath.length > 0 && (
              <div className="cad-ins-row">
                <span className="cad-ins-label">Insert Path</span>
                <span className="cad-ins-val cad-ins-path">
                  {data.insertPath.join(' → ')}
                </span>
              </div>
            )}
            {data.viewportId && renderRow('Viewport', data.viewportId)}
          </div>
        )}
      </div>
    </div>
  );
};

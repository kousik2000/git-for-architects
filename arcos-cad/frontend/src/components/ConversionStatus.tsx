import type { ConversionState } from '../types/cad';

interface ConversionStatusProps {
  state: ConversionState;
}

export function ConversionStatus({ state }: ConversionStatusProps) {
  if (state === 'IDLE' || state === 'FILE_SELECTED' || state === 'COMPLETED' || state === 'ERROR') {
    return null;
  }

  return (
    <div className="conversion-status-container">
      <div className="spinner"></div>
      <div className="status-text">
        {state === 'UPLOADING' && (
          <>
            <p className="primary-status">Uploading DWG...</p>
            <p className="secondary-status">Sending file to ARCOS backend</p>
          </>
        )}
        {state === 'CONVERTING' && (
          <>
            <p className="primary-status">Converting DWG to DXF...</p>
            <p className="secondary-status">Processing with LibreDWG</p>
          </>
        )}
      </div>
    </div>
  );
}

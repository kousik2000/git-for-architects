interface DownloadResultProps {
  originalFilename: string;
  resultBlob: Blob;
  onReset: () => void;
}

export function DownloadResult({ originalFilename, resultBlob, onReset }: DownloadResultProps) {
  const generatedFilename = originalFilename.replace(/\.[^/.]+$/, "") + ".dxf";

  const handleDownload = () => {
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="download-result-container">
      <div className="success-icon-container">
        <svg className="success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="success-title">✓ Conversion completed</h3>
      
      <div className="file-info-box">
        <div className="file-info-row">
          <span className="file-info-label">Original:</span>
          <span className="file-info-value">{originalFilename}</span>
        </div>
        <div className="file-info-row">
          <span className="file-info-label">Generated:</span>
          <span className="file-info-value highlight">{generatedFilename}</span>
        </div>
      </div>

      <div className="action-buttons">
        <button onClick={handleDownload} className="btn primary-btn" aria-label="Download DXF">
          Download DXF
        </button>
        <button onClick={onReset} className="btn secondary-btn" aria-label="Convert Another File">
          Convert Another File
        </button>
      </div>
    </div>
  );
}

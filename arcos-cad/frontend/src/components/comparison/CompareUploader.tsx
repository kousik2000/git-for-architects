import React, { useCallback, useRef } from 'react';

interface CompareUploaderProps {
  oldFile: File | null;
  newFile: File | null;
  onOldFileSelect: (file: File) => void;
  onNewFileSelect: (file: File) => void;
  onStartComparison: () => void;
  disabled?: boolean;
}

export function CompareUploader({
  oldFile,
  newFile,
  onOldFileSelect,
  onNewFileSelect,
  onStartComparison,
  disabled = false,
}: CompareUploaderProps) {
  
  const oldFileInputRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const handleOldFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onOldFileSelect(file);
  };

  const handleNewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onNewFileSelect(file);
  };

  const triggerOldUpload = () => {
    oldFileInputRef.current?.click();
  };

  const triggerNewUpload = () => {
    newFileInputRef.current?.click();
  };

  return (
    <div className="compare-uploader-panel" style={{ padding: '2rem', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <h2 style={{ margin: 0, textAlign: 'center', color: '#2c3e50' }}>Compare Drawings</h2>
      
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, border: '2px dashed #bdc3c7', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#7f8c8d', fontSize: '1rem' }}>Previous / Old Drawing</h3>
          <input
            type="file"
            accept=".dwg,.json"
            onChange={handleOldFileChange}
            disabled={disabled}
            style={{ display: 'none' }}
            ref={oldFileInputRef}
          />
          {oldFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ 
                color: '#1f2937', 
                fontWeight: 600, 
                fontSize: '14px', 
                lineHeight: 1.4, 
                maxWidth: '100%', 
                overflowWrap: 'anywhere',
                marginBottom: '1rem' 
              }}>
                {oldFile.name}
              </div>
              <button onClick={triggerOldUpload} disabled={disabled} className="btn text-btn" style={{ fontSize: '0.85rem' }}>Change File</button>
            </div>
          ) : (
            <button onClick={triggerOldUpload} disabled={disabled} className="btn secondary-btn" style={{ background: '#ecf0f1', color: '#2c3e50' }}>
              Choose File
            </button>
          )}
        </div>

        <div style={{ flex: 1, border: '2px dashed #bdc3c7', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 1rem 0', color: '#7f8c8d', fontSize: '1rem' }}>Current / New Drawing</h3>
          <input
            type="file"
            accept=".dwg,.json"
            onChange={handleNewFileChange}
            disabled={disabled}
            style={{ display: 'none' }}
            ref={newFileInputRef}
          />
          {newFile ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ 
                color: '#1f2937', 
                fontWeight: 600, 
                fontSize: '14px', 
                lineHeight: 1.4, 
                maxWidth: '100%', 
                overflowWrap: 'anywhere',
                marginBottom: '1rem' 
              }}>
                {newFile.name}
              </div>
              <button onClick={triggerNewUpload} disabled={disabled} className="btn text-btn" style={{ fontSize: '0.85rem' }}>Change File</button>
            </div>
          ) : (
            <button onClick={triggerNewUpload} disabled={disabled} className="btn secondary-btn" style={{ background: '#ecf0f1', color: '#2c3e50' }}>
              Choose File
            </button>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button
          className="btn primary-btn"
          disabled={disabled || !oldFile || !newFile}
          onClick={onStartComparison}
          style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
        >
          Start Comparison
        </button>
      </div>
    </div>
  );
}

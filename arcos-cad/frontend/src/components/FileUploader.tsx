import { useState, useRef } from 'react';

// 200 MB
const MAX_DWG_SIZE_MB = 200;
const MAX_DWG_SIZE_BYTES = MAX_DWG_SIZE_MB * 1024 * 1024;

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

export function FileUploader({ onFileSelect, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndSelectFile = (file: File) => {
    setError(null);
    
    if (!file.name.toLowerCase().endsWith('.dwg') && !file.name.toLowerCase().endsWith('.json')) {
      setError('Only DWG and JSON files are supported.');
      return;
    }

    if (file.size > MAX_DWG_SIZE_BYTES) {
      setError(`File exceeds the maximum allowed size of ${MAX_DWG_SIZE_MB}MB.`);
      return;
    }

    onFileSelect(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSelectFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSelectFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="file-uploader-container">
      <div 
        className={`drop-zone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <div className="drop-zone-content">
          <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <p className="primary-text">Drop DWG here</p>
          <p className="secondary-text">or <span className="highlight-text">Choose File</span></p>
        </div>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".dwg,.json"
          disabled={disabled}
          className="hidden-input"
          aria-label="Choose File"
        />
      </div>
      
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

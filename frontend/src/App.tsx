import { useState } from 'react';
import type { ConversionState } from './types/cad';
import { cadApi, CadApiError } from './services/cadApi';
import { FileUploader } from './components/FileUploader';
import { ConversionStatus } from './components/ConversionStatus';
import { DownloadResult } from './components/DownloadResult';
import { ConfigModal } from './components/ConfigModal';
import './App.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<ConversionState>('IDLE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setState('FILE_SELECTED');
    setErrorMsg(null);
  };

  const handleConvert = async () => {
    if (!file) return;

    setState('UPLOADING');
    setErrorMsg(null);

    try {
      // Small simulated delay to show uploading state before processing
      // In a real app with progress events, this would be driven by XMLHttpRequest or similar
      setTimeout(() => {
        if (state === 'UPLOADING') {
          setState('CONVERTING');
        }
      }, 800);

      const blob = await cadApi.convertDwg(file);
      
      setResultBlob(blob);
      setState('COMPLETED');
    } catch (err) {
      setState('ERROR');
      if (err instanceof CadApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred during conversion.');
      }
    }
  };

  const handleReset = () => {
    setFile(null);
    setState('IDLE');
    setErrorMsg(null);
    setResultBlob(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isProcessing = state === 'UPLOADING' || state === 'CONVERTING';

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="logo-text">ARCOS CAD</h1>
        <h2 className="subtitle">DWG → DXF Converter</h2>
        <button 
          className="config-btn" 
          onClick={() => setIsConfigOpen(true)}
          aria-label="Configuration"
          title="Configuration"
        >
          <svg className="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
        </button>
      </header>

      <ConfigModal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />

      <main className="main-content">
        {state === 'IDLE' && (
          <FileUploader onFileSelect={handleFileSelect} disabled={false} />
        )}

        {(state === 'FILE_SELECTED' || isProcessing || state === 'ERROR') && file && (
          <div className="selected-file-panel">
            <h3 className="panel-title">Selected file:</h3>
            <div className="file-details">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{formatFileSize(file.size)}</span>
            </div>

            {state === 'FILE_SELECTED' && (
              <div className="action-buttons">
                <button 
                  onClick={handleConvert} 
                  className="btn primary-btn"
                  aria-label="Convert"
                >
                  Convert
                </button>
                <button 
                  onClick={handleReset} 
                  className="btn text-btn"
                  aria-label="Cancel"
                >
                  Cancel
                </button>
              </div>
            )}

            {isProcessing && <ConversionStatus state={state} />}

            {state === 'ERROR' && (
              <div className="error-panel">
                <div className="error-message" role="alert">{errorMsg}</div>
                <button onClick={handleReset} className="btn secondary-btn mt-4">
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {state === 'COMPLETED' && file && resultBlob && (
          <DownloadResult 
            originalFilename={file.name} 
            resultBlob={resultBlob} 
            onReset={handleReset} 
          />
        )}
      </main>
    </div>
  );
}

export default App;

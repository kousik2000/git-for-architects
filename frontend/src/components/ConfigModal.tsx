import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '../services/cadApi';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ConfigModal({ isOpen, onClose }: ConfigModalProps) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (isOpen) {
      setUrl(getApiBaseUrl());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('API_BASE_URL', url);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 className="modal-title">API Configuration</h3>
        <p className="modal-description">Set the base URL for the ARCOS backend.</p>
        <input 
          type="text" 
          className="config-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:8000"
        />
        <div className="modal-actions">
          <button onClick={onClose} className="btn text-btn">Cancel</button>
          <button onClick={handleSave} className="btn primary-btn">Save</button>
        </div>
      </div>
    </div>
  );
}

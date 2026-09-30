import React, { useState } from 'react';
import { cadApi, CadApiError } from '../../services/cadApi';
import { compareCadDocuments } from '../../comparison/comparison/compare-documents';
import { CompareUploader } from './CompareUploader';
import { ComparisonViewer } from './ComparisonViewer';
import type { ComparisonWorkflowState, ComparisonSession } from '../../types/cad';
import type { ArcosCadDocument } from '../../types/cad-json';

import { TIMING } from '../../comparison/performance/timingLogger';
export function ComparisonWorkflow({ onClose }: { onClose: () => void }) {
  const [workflowState, setWorkflowState] = useState<ComparisonWorkflowState>('IDLE');
  const [oldFile, setOldFile] = useState<File | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [session, setSession] = useState<ComparisonSession | null>(null);

  const handleStartComparison = async () => {
    TIMING.mark('T0');
    if (!oldFile || !newFile) return;

    setWorkflowState('PROCESSING');
    setErrorMsg(null);
    setProgressMsg('Uploading and parsing CAD files...');

    try {
      // Helper to process a single file (JSON or DWG)
      const processFile = async (file: File): Promise<ArcosCadDocument> => {
        if (file.name.toLowerCase().endsWith('.json')) {
          const text = await file.text();
          const jsonResponse = JSON.parse(text);
          return jsonResponse.data || jsonResponse;
        }
        return await cadApi.parseDwg(file);
      };

      // We run them concurrently for performance
      const [oldDoc, newDoc] = await Promise.all([
        processFile(oldFile).then(doc => { TIMING.mark('T1'); return doc; }).catch(err => {
          throw new Error(`Previous/Old Drawing Failed: ${err.message || 'Unknown error'}`);
        }),
        processFile(newFile).then(doc => { TIMING.mark('T2'); return doc; }).catch(err => {
          throw new Error(`Current/New Drawing Failed: ${err.message || 'Unknown error'}`);
        })
      ]);

      setProgressMsg('Comparing documents...');
      
      // Delay to let UI update
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = compareCadDocuments(oldDoc, newDoc);

      setSession({
        oldCadJson: oldDoc,
        newCadJson: newDoc,
        comparisonResult: result,
        oldFileName: oldFile.name,
        newFileName: newFile.name
      });
      setWorkflowState('COMPLETED');
      
    } catch (err: any) {
      setWorkflowState('ERROR');
      setErrorMsg(err.message || 'An unexpected error occurred during comparison setup.');
    }
  };

  const handleReset = () => {
    setWorkflowState('IDLE');
    setErrorMsg(null);
    setProgressMsg('');
  };

  if (workflowState === 'COMPLETED' && session) {
    return (
      <ComparisonViewer 
        session={session} 
        onClose={onClose} 
      />
    );
  }

  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      
      {workflowState === 'IDLE' && (
        <CompareUploader
          oldFile={oldFile}
          newFile={newFile}
          onOldFileSelect={setOldFile}
          onNewFileSelect={setNewFile}
          onStartComparison={handleStartComparison}
        />
      )}

      {workflowState === 'PROCESSING' && (
        <div style={{ textAlign: 'center', background: '#fff', padding: '2rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
          <h3 style={{ margin: 0, color: '#34495e' }}>{progressMsg}</h3>
        </div>
      )}

      {workflowState === 'ERROR' && (
        <div className="error-panel" style={{ maxWidth: '600px', width: '100%' }}>
          <h3 style={{ marginTop: 0 }}>Comparison Failed</h3>
          <div className="error-message" role="alert">{errorMsg}</div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button onClick={handleReset} className="btn secondary-btn">Try Again</button>
            <button onClick={onClose} className="btn text-btn">Cancel</button>
          </div>
        </div>
      )}

    </div>
  );
}

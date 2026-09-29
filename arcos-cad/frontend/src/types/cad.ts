export type ConversionState =
  | 'IDLE'
  | 'FILE_SELECTED'
  | 'UPLOADING'
  | 'CONVERTING'
  | 'COMPLETED'
  | 'ERROR';

export interface ConversionError {
  code: string;
  message: string;
}

export type AppMode = 'SINGLE' | 'COMPARE';

export type ComparisonWorkflowState =
  | 'IDLE'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'ERROR';

export interface ComparisonSession {
  oldCadJson: any; // We'll use any here or import ArcosCadDocument where needed to avoid circular if any
  newCadJson: any;
  comparisonResult: any;
  oldFileName: string;
  newFileName: string;
}


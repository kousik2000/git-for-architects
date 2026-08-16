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

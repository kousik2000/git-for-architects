import { render, screen, fireEvent } from '@testing-library/react';
import { FileUploader } from '../src/components/FileUploader';
import { describe, it, expect, vi } from 'vitest';

describe('FileUploader', () => {
  it('renders initial state correctly', () => {
    render(<FileUploader onFileSelect={() => {}} disabled={false} />);
    expect(screen.getByText('Drop DWG here')).toBeInTheDocument();
  });

  it('shows error for non-DWG file', () => {
    const onFileSelect = vi.fn();
    render(<FileUploader onFileSelect={onFileSelect} disabled={false} />);
    
    const file = new File(['dummy content'], 'test.txt', { type: 'text/plain' });
    const input = screen.getByLabelText('Choose File');
    
    fireEvent.change(input, { target: { files: [file] } });
    
    expect(screen.getByText('Only DWG files are supported.')).toBeInTheDocument();
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('shows error for file exceeding 200MB', () => {
    const onFileSelect = vi.fn();
    render(<FileUploader onFileSelect={onFileSelect} disabled={false} />);
    
    const file = new File([''], 'test.dwg', { type: 'application/acad' });
    Object.defineProperty(file, 'size', { value: 201 * 1024 * 1024 }); // 201MB
    
    const input = screen.getByLabelText('Choose File');
    fireEvent.change(input, { target: { files: [file] } });
    
    expect(screen.getByText('File exceeds the maximum allowed size of 200MB.')).toBeInTheDocument();
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('calls onFileSelect for valid DWG file', () => {
    const onFileSelect = vi.fn();
    render(<FileUploader onFileSelect={onFileSelect} disabled={false} />);
    
    const file = new File(['valid'], 'valid.dwg', { type: 'application/acad' });
    
    const input = screen.getByLabelText('Choose File');
    fireEvent.change(input, { target: { files: [file] } });
    
    expect(onFileSelect).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

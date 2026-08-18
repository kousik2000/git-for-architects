import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cadApi } from '../src/services/cadApi';

// Mock the API
vi.mock('../src/services/cadApi', () => ({
  cadApi: {
    convertDwg: vi.fn(),
  },
  CadApiError: class CadApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles successful conversion flow', async () => {
    const mockBlob = new Blob(['mock dxf content'], { type: 'application/dxf' });
    vi.mocked(cadApi.convertDwg).mockResolvedValueOnce(mockBlob);
    
    // Mock URL.createObjectURL
    const createObjectURLMock = vi.fn(() => 'blob:test-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    render(<App />);

    // 1. Select file
    const file = new File(['dummy'], 'test.dwg', { type: 'application/acad' });
    const input = screen.getByLabelText('Choose File');
    fireEvent.change(input, { target: { files: [file] } });

    // 2. Verify selected state
    expect(screen.getByText('test.dwg')).toBeInTheDocument();
    
    // 3. Click Convert
    const convertBtn = screen.getByLabelText('Convert');
    fireEvent.click(convertBtn);

    // 4. Verify completion state
    await waitFor(() => {
      expect(screen.getByText('✓ Conversion completed')).toBeInTheDocument();
    });

    // 5. Download action
    const downloadBtn = screen.getByLabelText('Download DXF');
    expect(downloadBtn).toBeInTheDocument();
    
    // Reset state
    const resetBtn = screen.getByLabelText('Convert Another File');
    fireEvent.click(resetBtn);
    expect(screen.getByText('Drop DWG here')).toBeInTheDocument();
  });
});

export const getApiBaseUrl = () => {
  return localStorage.getItem('API_BASE_URL') || import.meta.env.VITE_API_BASE_URL || 'http://192.168.0.100:8000';
};

export class CadApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CadApiError';
  }
}

export const cadApi = {
  /**
   * Uploads a DWG file to the backend to be converted to DXF.
   * Returns a Blob representing the resulting DXF file.
   */
  async convertDwg(file: File): Promise<Blob> {
    const formData = new FormData();
    formData.append('file', file);
    const baseUrl = getApiBaseUrl();

    try {
      const response = await fetch(`${baseUrl}/api/cad/convert/`, {
        method: 'POST',
        body: formData,
        // Notice: Do NOT set Content-Type header when sending FormData.
        // The browser sets it automatically with the correct boundary.
      });

      if (!response.ok) {
        let code = 'NETWORK_ERROR';
        let message = 'An unexpected error occurred during conversion.';
        
        try {
          // Attempt to parse JSON error from backend
          const errorData = await response.json();
          code = errorData.error || `HTTP_${response.status}`;
          message = errorData.details || errorData.message || message;
        } catch (e) {
          // If response is not JSON
          if (response.status === 413) {
            code = 'FILE_TOO_LARGE';
            message = 'The selected file is too large for the server to process.';
          } else if (response.status === 503 || response.status === 504) {
            code = 'CAD_CONVERTER_UNAVAILABLE';
            message = 'The CAD conversion service is currently unavailable. Please try again.';
          } else if (response.status === 500) {
            code = 'SERVER_ERROR';
            message = 'An internal server error occurred while processing the file.';
          }
        }
        
        throw new CadApiError(code, message);
      }

      // Read response as Blob (DXF data)
      return await response.blob();
    } catch (error) {
      if (error instanceof CadApiError) {
        throw error;
      }
      // Map native fetch network errors
      throw new CadApiError('NETWORK_ERROR', 'Unable to connect to the ARCOS backend. Please ensure the server is running.');
    }
  },

  /**
   * Uploads a DWG file to be parsed into ARCOS CAD JSON.
   */
  async parseDwg(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const baseUrl = getApiBaseUrl();

    try {
      const response = await fetch(`${baseUrl}/api/cad/parse/`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let code = 'NETWORK_ERROR';
        let message = 'An unexpected error occurred during parsing.';
        
        try {
          const errorData = await response.json();
          code = errorData.code || `HTTP_${response.status}`;
          message = errorData.message || message;
        } catch (e) {
          if (response.status === 413) {
            code = 'FILE_TOO_LARGE';
            message = 'The selected file is too large for the server to process.';
          } else if (response.status === 503 || response.status === 504) {
            code = 'CAD_CONVERTER_UNAVAILABLE';
            message = 'The CAD conversion service is currently unavailable. Please try again.';
          } else if (response.status === 500) {
            code = 'SERVER_ERROR';
            message = 'An internal server error occurred while processing the file.';
          }
        }
        
        throw new CadApiError(code, message);
      }

      const jsonResponse = await response.json();
      if (!jsonResponse.success) {
        throw new CadApiError('PARSING_FAILED', 'Parsing succeeded via HTTP but returned failure status.');
      }
      
      return jsonResponse.data;
    } catch (error) {
      if (error instanceof CadApiError) {
        throw error;
      }
      throw new CadApiError('NETWORK_ERROR', 'Unable to connect to the ARCOS backend. Please ensure the server is running.');
    }
  }
};

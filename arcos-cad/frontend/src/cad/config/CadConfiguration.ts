export interface CadInteractionConfig {
  hoverHighlight: boolean;
  hoverInfo: boolean;
  pickbox: {
    enabled: boolean;
    sizePixels: number;
    borderWidth: number;
  };
  crosshair: {
    enabled: boolean;
    horizontalLengthPixels: number;
    verticalLengthPixels: number;
    lineWidth: number;
  };
  selectionOnClick?: boolean;
}

export interface CadSnappingConfig {
  enabled: boolean;
  tolerancePixels: number;
  indicatorSizePixels: number;
  enabledTypes: {
    endpoint: boolean;
    midpoint: boolean;
    center: boolean;
    nearest: boolean;
  };
}

export interface CadConfiguration {
  interaction: CadInteractionConfig;
  snapping: CadSnappingConfig;
}

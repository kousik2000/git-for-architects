import type { CadConfiguration } from './CadConfiguration';

export const defaultCadConfiguration: CadConfiguration = {
  interaction: {
    hoverHighlight: false,
    hoverInfo: false,
    pickbox: {
      enabled: true,
      sizePixels: 10,
      borderWidth: 1
    },
    crosshair: {
      enabled: true,
      horizontalLengthPixels: 100,
      verticalLengthPixels: 100,
      lineWidth: 1
    },
    selectionOnClick: true
  },
  snapping: {
    enabled: false,
    tolerancePixels: 10,
    indicatorSizePixels: 10,
    enabledTypes: {
      endpoint: true,
      midpoint: true,
      center: true,
      nearest: true
    }
  }
};

import type { PermissionKey } from './permissions';

export const permissionConfig: Record<PermissionKey, boolean> = {
  "cad.view": true,
  "cad.upload": true,
  "cad.download": true,
  "cad.pan": true,
  "cad.zoom": true,
  "cad.fit": true,
  "cad.close": true,
  "cad.layers.view": true,
  "cad.layers.toggle": true,
  "cad.entity.select": true,
  "cad.measure.distance": true,
  "cad.measure.area": true,
  "cad.measure.angle": true
};

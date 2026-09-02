export const PERMISSIONS = {
  // Viewer
  CAD_VIEW: 'cad.view',
  CAD_UPLOAD: 'cad.upload',
  CAD_DOWNLOAD: 'cad.download',

  // Controls
  CAD_PAN: 'cad.pan',
  CAD_ZOOM: 'cad.zoom',
  CAD_FIT: 'cad.fit',
  CAD_CLOSE: 'cad.close',

  // Layouts
  CAD_LAYOUTS_VIEW: 'cad.layouts.view',
  CAD_LAYOUT_SWITCH: 'cad.layout.switch',
  CAD_DIMENSION_VIEW: 'cad.dimension.view',
  CAD_LEADER_VIEW: 'cad.leader.view',
  CAD_MLEADER_VIEW: 'cad.mleader.view',
  CAD_ARROWHEAD_VIEW: 'cad.arrowhead.view',

  // Layers
  CAD_LAYERS_VIEW: 'cad.layers.view',
  CAD_LAYERS_TOGGLE: 'cad.layers.toggle',

  // Entity
  CAD_ENTITY_SELECT: 'cad.entity.select',

  // Measure
  CAD_MEASURE_DISTANCE: 'cad.measure.distance',
  CAD_MEASURE_AREA: 'cad.measure.area',
  CAD_MEASURE_ANGLE: 'cad.measure.angle',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

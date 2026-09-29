export const COMPARISON_TOLERANCE = {
  geometry: 1e-5,   // For coordinates
  angle: 1e-4,      // For radians
  radius: 1e-5,     // For circle/arc radii
  bulge: 1e-5       // For LWPOLYLINE bulges
};

export function setTolerance(options: Partial<typeof COMPARISON_TOLERANCE>) {
  Object.assign(COMPARISON_TOLERANCE, options);
}

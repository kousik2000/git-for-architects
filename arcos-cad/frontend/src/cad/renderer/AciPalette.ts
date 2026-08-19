export const AciPalette: number[] = [
  // 0 is BYBLOCK
  0x000000,
  // 1-7 Standard Colors
  0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff,
  // 8-9 Dark/Light Grey
  0x414141, 0x808080,
  // 10-255 Approximation (for this phase we provide a simplified mapping, 
  // normally this is a full 256 color lookup table)
  // Let's generate a quick fallback algorithm for the rest if not provided explicitly:
];

// Helper to fill the rest of the 256 colors with a deterministic color based on index
for (let i = 10; i < 256; i++) {
  // Simple hue sweep for the missing ACI colors
  const hue = (i * 1.4) % 360;
  // Convert HSV to RGB roughly
  const s = 1.0;
  const v = 0.8;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  AciPalette[i] = (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

export function getAciColor(aci: number): number {
  if (aci >= 0 && aci < 256) {
    // ACI 7 is White/Black. On a dark background, we use white.
    if (aci === 7) return 0xffffff;
    return AciPalette[aci];
  }
  return 0xffffff; // Default fallback
}

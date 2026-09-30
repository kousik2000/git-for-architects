export const TIMING = {
  events: {} as Record<string, number>,
  mark: (key: string) => {
    if (TIMING.events[key]) return; // Only log once per session
    TIMING.events[key] = performance.now();
    console.log(`[TIMING] ${key}: ${TIMING.events[key].toFixed(2)}ms`);
  },
  report: () => {
    console.log("=== TIMING REPORT ===");
    const e = TIMING.events;
    const t0 = e.T0 || 0;
    
    console.log("Document processing:");
    if (e.T1 && e.T2) console.log(`  OLD processing: ${(e.T4 - e.T3).toFixed(2)} ms`);
    if (e.T5 && e.T6) console.log(`  NEW processing: ${(e.T6 - e.T5).toFixed(2)} ms`);
    
    console.log("Comparison:");
    if (e.T7 && e.T8) console.log(`  matching duration: ${(e.T8 - e.T7).toFixed(2)} ms`);
    
    console.log("OLD rendering:");
    if (e.T11 && e.T12) console.log(`  geometry construction: ${(e.T12 - e.T11).toFixed(2)} ms`);
    if (e.T10 && e.T13) console.log(`  first render: ${(e.T13 - e.T10).toFixed(2)} ms`);
    if (e.T10 && e.T14) console.log(`  interactive: ${(e.T14 - e.T10).toFixed(2)} ms`);

    console.log("NEW rendering:");
    if (e.T16 && e.T17) console.log(`  geometry construction: ${(e.T17 - e.T16).toFixed(2)} ms`);
    if (e.T15 && e.T18) console.log(`  first render: ${(e.T18 - e.T15).toFixed(2)} ms`);
    if (e.T15 && e.T19) console.log(`  interactive: ${(e.T19 - e.T15).toFixed(2)} ms`);

    console.log("Overlay:");
    if (e.T20 && e.T21) console.log(`  overlay construction: ${(e.T21 - e.T20).toFixed(2)} ms`);
    if (e.T20 && e.T22) console.log(`  first visible overlay: ${(e.T22 - e.T20).toFixed(2)} ms`);

    console.log("Change List:");
    if (e.T23 && e.T24) console.log(`  processing: ${(e.T24 - e.T23).toFixed(2)} ms`);
    if (e.T23 && e.T25) console.log(`  rendering: ${(e.T25 - e.T24).toFixed(2)} ms`);

    if (e.T25) console.log(`Total comparison start -> fully interactive: ${(e.T25 - e.T0).toFixed(2)} ms`);
  }
};
(window as any).COMPARISON_TIMING = TIMING;

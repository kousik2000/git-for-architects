#!/usr/bin/env python3
"""
DEEP FORENSIC — inspect raw DXF group codes for VIEWPORTs
Specifically look for clipping boundary handles and non-rectangular viewports.
"""

import re
import sys
import json

DXF_PATH = r"E:\viewer_v2\dxf_files\TERMINALDESIGN PART 2.dxf"

def parse_dxf_entities(filepath):
    """Parse DXF file into sections/entities."""
    with open(filepath, 'r', errors='replace') as f:
        lines = f.readlines()
    
    # Parse into code/value pairs
    pairs = []
    i = 0
    while i < len(lines) - 1:
        code = lines[i].strip()
        value = lines[i+1].strip()
        pairs.append((code, value))
        i += 2
    
    return pairs

def find_viewports_raw(pairs):
    """Find all VIEWPORT entities and extract their group codes."""
    viewports = []
    i = 0
    
    while i < len(pairs):
        code, value = pairs[i]
        
        if code == '0' and value == 'VIEWPORT':
            # Collect all group codes until next entity
            vp = {"_index": i, "codes": {}, "xdata": []}
            i += 1
            
            current_app = None
            while i < len(pairs):
                c, v = pairs[i]
                
                if c == '0':  # Next entity
                    break
                elif c == '1001':  # XDATA application name
                    current_app = v
                    vp["xdata"].append({"app": v, "data": []})
                elif current_app is not None and len(vp["xdata"]) > 0:
                    vp["xdata"][-1]["data"].append((c, v))
                else:
                    # Multiple values for same code - store as list
                    if c in vp["codes"]:
                        if not isinstance(vp["codes"][c], list):
                            vp["codes"][c] = [vp["codes"][c]]
                        vp["codes"][c].append(v)
                    else:
                        vp["codes"][c] = v
                
                i += 1
            
            viewports.append(vp)
        else:
            i += 1
    
    return viewports

def find_entities_by_handle(pairs, handles):
    """Find entities matching given handles."""
    results = {}
    i = 0
    
    while i < len(pairs):
        code, value = pairs[i]
        
        if code == '0' and value not in ('SECTION', 'ENDSEC', 'EOF'):
            entity_type = value
            entity_data = {"type": entity_type, "codes": {}, "xdata": []}
            i += 1
            
            current_app = None
            while i < len(pairs):
                c, v = pairs[i]
                if c == '0':
                    break
                elif c == '5' and v in handles:
                    # This entity has a matching handle
                    entity_data["handle"] = v
                elif c == '1001':
                    current_app = v
                    entity_data["xdata"].append({"app": v, "data": []})
                elif current_app is not None:
                    entity_data["xdata"][-1]["data"].append((c, v))
                else:
                    if c in entity_data["codes"]:
                        if not isinstance(entity_data["codes"][c], list):
                            entity_data["codes"][c] = [entity_data["codes"][c]]
                        entity_data["codes"][c].append(v)
                    else:
                        entity_data["codes"][c] = v
                i += 1
            
            if "handle" in entity_data:
                results[entity_data["handle"]] = entity_data
        else:
            i += 1
    
    return results

def analyze_viewport(vp, idx):
    """Analyze a single viewport's group codes."""
    codes = vp["codes"]
    
    handle = codes.get("5", "N/A")
    
    # Group code meanings for VIEWPORT:
    # 10,20,30 = center point (PaperSpace)
    # 40 = width
    # 41 = height  
    # 12,22 = view center (Modelspace)
    # 45 = view height
    # 16,26,36 = view direction vector
    # 51 = snap angle / twist angle
    # 68 = status flags
    # 69 = viewport ID
    # 340 = clipping boundary handle
    # 1 = plot style
    # 281 = clipping mode (1=clipping on)
    # 72 = circle sides
    
    print(f"\n  VP #{idx+1} handle={handle}")
    print(f"    Code 68 (status): {codes.get('68', 'N/A')}")
    print(f"    Code 10,20,30 (center): {codes.get('10','?')},{codes.get('20','?')},{codes.get('30','?')}")
    print(f"    Code 40 (width): {codes.get('40', 'N/A')}")
    print(f"    Code 41 (height): {codes.get('41', 'N/A')}")
    print(f"    Code 12,22 (view center): {codes.get('12','?')},{codes.get('22','?')}")
    print(f"    Code 45 (view height): {codes.get('45', 'N/A')}")
    print(f"    Code 16,26,36 (view dir): {codes.get('16','?')},{codes.get('26','?')},{codes.get('36','?')}")
    print(f"    Code 51 (twist): {codes.get('51', 'N/A')}")
    print(f"    Code 340 (clip handle): {codes.get('340', 'NONE')}")
    print(f"    Code 281 (clip mode): {codes.get('281', 'N/A')}")
    
    # Check for any non-standard codes
    standard_codes = {'5', '67', '100', '10', '20', '30', '40', '41', '68', '69',
                      '12', '22', '45', '16', '26', '36', '17', '27', '37', '51',
                      '72', '74', '75', '76', '77', '78', '79', '146', '170', '281',
                      '340', '1', '281', '71', '73', '90', '65', '118', '110', '120',
                      '130', '111', '121', '131', '112', '122', '132'}
    
    non_standard = {k: v for k, v in codes.items() if k not in standard_codes}
    if non_standard:
        print(f"    Non-standard codes: {non_standard}")
    
    if vp["xdata"]:
        print(f"    XDATA:")
        for xd in vp["xdata"]:
            print(f"      App: {xd['app']}")
            for c, v in xd["data"][:5]:
                print(f"        {c}: {v}")
    
    return {
        "handle": handle,
        "status": codes.get("68", "0"),
        "clip_handle": codes.get("340", None),
        "clip_mode": codes.get("281", None),
        "width": codes.get("40"),
        "height": codes.get("41"),
        "all_codes": list(codes.keys())
    }

def main():
    print("Loading DXF file...")
    pairs = parse_dxf_entities(DXF_PATH)
    print(f"Parsed {len(pairs)} code/value pairs")
    
    print("\nFinding VIEWPORT entities...")
    viewports = find_viewports_raw(pairs)
    print(f"Found {len(viewports)} VIEWPORT entities")
    
    # Identify which section each viewport is in
    # We need to track SECTION names
    print("\n" + "="*70)
    print("ALL VIEWPORTS — RAW GROUP CODES")
    print("="*70)
    
    # Find section boundaries
    sections = {}
    current_section = None
    for i, (code, value) in enumerate(pairs):
        if code == '0' and value == 'SECTION':
            pass
        elif code == '2' and pairs[i-1][0] == '0' and pairs[i-1][1] == 'SECTION':
            current_section = value
            sections[current_section] = i
    
    vp_summaries = []
    clip_handles_to_find = set()
    
    for idx, vp in enumerate(viewports):
        summary = analyze_viewport(vp, idx)
        vp_summaries.append(summary)
        
        clip_h = summary.get("clip_handle")
        if clip_h and clip_h != "0" and clip_h != "NONE":
            clip_handles_to_find.add(clip_h)
    
    print(f"\n{'='*70}")
    print("CLIPPING BOUNDARY ANALYSIS")
    print(f"{'='*70}")
    
    # Count viewports with clip handles
    with_clip = [s for s in vp_summaries if s["clip_handle"] and s["clip_handle"] != "0"]
    without_clip = [s for s in vp_summaries if not s["clip_handle"] or s["clip_handle"] == "0"]
    
    print(f"\nTotal VIEWPORTs: {len(vp_summaries)}")
    print(f"With clipping boundary (handle != 0): {len(with_clip)}")
    print(f"Without clipping boundary (handle == 0 or None): {len(without_clip)}")
    
    if with_clip:
        print(f"\nVIEWPORTs with clipping boundaries:")
        for s in with_clip:
            print(f"  handle={s['handle']}, clip_handle={s['clip_handle']}, clip_mode={s['clip_mode']}")
        
        print(f"\nLooking up clipping boundary entities...")
        clip_entities = find_entities_by_handle(pairs, clip_handles_to_find)
        
        for handle, entity in clip_entities.items():
            print(f"\n  Clipping entity handle={handle}")
            print(f"    Type: {entity['type']}")
            codes = entity["codes"]
            print(f"    Codes: {list(codes.keys())}")
            
            # If LWPOLYLINE, extract points
            if entity["type"] == "LWPOLYLINE":
                xs = codes.get("10", [])
                ys = codes.get("20", [])
                if not isinstance(xs, list):
                    xs = [xs]
                if not isinstance(ys, list):
                    ys = [ys]
                points = list(zip([float(x) for x in xs], [float(y) for y in ys]))
                print(f"    Points ({len(points)}): {points[:8]}{'...' if len(points) > 8 else ''}")
            elif entity["type"] == "POLYLINE":
                print(f"    POLYLINE (need to find VERTEX entities)")
    else:
        print("\nNO VIEWPORTS HAVE CLIPPING BOUNDARIES.")
        print("All viewports are RECTANGULAR (using center ± width/2, center ± height/2).")
    
    # Check if there are non-rectangular hints in status flags
    print(f"\n{'='*70}")
    print("STATUS FLAG ANALYSIS")
    print(f"{'='*70}")
    
    # Status flag bits for VIEWPORT:
    # Bit 1 (0x01): Viewport is active
    # Bit 2 (0x02): Viewport is perspective on
    # Bit 4 (0x04): Front clipping on
    # Bit 8 (0x08): Back clipping on
    # Bit 16 (0x10): UCS follow mode on
    # Bit 32 (0x20): Front clipping not at eye
    # Bit 64 (0x40): UCS icon visibility
    # Bit 128 (0x80): Fast zoom on
    # Bit 256 (0x100): Snap on
    # Bit 512 (0x200): Grid on
    # Bit 1024 (0x400): Snap style isometric
    # Bit 2048 (0x800): Hide plot mode on
    # Bit 4096 (0x1000): Snap isopair top
    # Bit 8192 (0x2000): Snap isopair right
    # Bit 16384 (0x4000): Viewport zoomed to sheet extent
    # Bit 32768 (0x8000): Plot hidden lines
    
    unique_statuses = set()
    for s in vp_summaries:
        unique_statuses.add(s["status"])
    
    print(f"\nUnique status values: {unique_statuses}")
    for status_str in unique_statuses:
        try:
            status = int(status_str)
            bits = []
            for bit, name in [(1, "Active"), (2, "Perspective"), (4, "FrontClip"), 
                              (8, "BackClip"), (16, "UCSFollow"), (32, "FrontNotAtEye"),
                              (64, "UCSIconVis"), (128, "FastZoom"), (256, "Snap"),
                              (512, "Grid"), (1024, "SnapIso"), (2048, "HidePlot"),
                              (16384, "ZoomedToSheet")]:
                if status & bit:
                    bits.append(name)
            print(f"  Status {status} (0x{status:X}): {bits}")
        except:
            print(f"  Status {status_str}: (parse error)")
    
    # Check code 281 (clipping)
    print(f"\n{'='*70}")
    print("CLIPPING MODE CHECK (Code 281)")
    print(f"{'='*70}")
    modes = set()
    for vp in viewports:
        mode = vp["codes"].get("281")
        if mode:
            modes.add(mode)
    print(f"Unique clipping mode values: {modes}")

if __name__ == "__main__":
    main()

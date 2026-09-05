#!/usr/bin/env python3
"""
PHASE 5.16C-B — TWIST FORENSIC ANALYSIS
Inspect all VIEWPORT twist angles in TERMINALDESIGN PART 2.dxf
and any other DXF in the repo.
"""
import sys, os, math

DXF_FILES = [
    r"E:\viewer_v2\dxf_files\TERMINALDESIGN PART 2.dxf",
    r"E:\viewer_v2\dxf_files\F2841747.dxf",
]

def parse_viewports_raw(filepath):
    """Parse VIEWPORT entities raw and extract twist / direction / dimensions."""
    viewports = []
    
    with open(filepath, 'r', errors='replace') as f:
        lines = f.readlines()
    
    pairs = []
    i = 0
    while i < len(lines) - 1:
        pairs.append((lines[i].strip(), lines[i+1].strip()))
        i += 2
    
    i = 0
    while i < len(pairs):
        code, value = pairs[i]
        if code == '0' and value == 'VIEWPORT':
            vp = {}
            i += 1
            while i < len(pairs):
                c, v = pairs[i]
                if c == '0':
                    break
                vp[c] = v
                i += 1
            
            handle   = vp.get('5', 'N/A')
            status   = int(vp.get('68', '0'))
            # Code 10,20,30 = center (PaperSpace)
            cx = float(vp.get('10', '0'))
            cy = float(vp.get('20', '0'))
            # Code 40,41 = width, height
            width  = float(vp.get('40', '0'))
            height = float(vp.get('41', '0'))
            # Code 12,22 = viewCenter
            vcx = float(vp.get('12', '0'))
            vcy = float(vp.get('22', '0'))
            # Code 45 = viewHeight
            vh = float(vp.get('45', '0'))
            # Code 16,26,36 = viewDirection
            vdx = float(vp.get('16', '0'))
            vdy = float(vp.get('26', '0'))
            vdz = float(vp.get('36', '1'))
            # Code 51 = twist angle (radians in DXF R12, degrees in R2000+?)
            twist_raw = float(vp.get('51', '0'))
            
            viewports.append({
                'handle': handle,
                'status': status,
                'center': (cx, cy),
                'width': width,
                'height': height,
                'viewCenter': (vcx, vcy),
                'viewHeight': vh,
                'viewDir': (vdx, vdy, vdz),
                'twist_raw': twist_raw,
                'clip_handle': vp.get('340', '0'),
            })
        else:
            i += 1
    
    return viewports

def main():
    for dxf_path in DXF_FILES:
        if not os.path.exists(dxf_path):
            print(f"SKIP (not found): {dxf_path}")
            continue
        
        fname = os.path.basename(dxf_path)
        print(f"\n{'='*70}")
        print(f"FILE: {fname}")
        print(f"{'='*70}")
        
        viewports = parse_viewports_raw(dxf_path)
        print(f"Total VIEWPORTs: {len(viewports)}")
        
        # Filter to active ones only
        active = [v for v in viewports if v['status'] & 0x01]
        print(f"Active VIEWPORTs (status & 0x01): {len(active)}")
        
        twists = [v['twist_raw'] for v in active]
        
        zero_twist   = [v for v in active if abs(v['twist_raw']) < 1e-9]
        nonzero_twist = [v for v in active if abs(v['twist_raw']) >= 1e-9]
        
        print(f"\nTwist = 0:      {len(zero_twist)}")
        print(f"Twist != 0:     {len(nonzero_twist)}")
        
        if twists:
            print(f"Min twist raw:  {min(twists):.6f}")
            print(f"Max twist raw:  {max(twists):.6f}")
        
        unique_twists = sorted(set(v['twist_raw'] for v in active))
        print(f"Unique twist values: {unique_twists}")
        
        if nonzero_twist:
            print(f"\nNon-zero twist VIEWPORTs:")
            for v in nonzero_twist:
                print(f"  handle={v['handle']}")
                print(f"    twist_raw={v['twist_raw']:.6f} rad = {math.degrees(v['twist_raw']):.3f} deg")
                print(f"    center={v['center']}, width={v['width']:.4f}, height={v['height']:.4f}")
                print(f"    viewCenter={v['viewCenter']}, viewHeight={v['viewHeight']:.4f}")
                print(f"    viewDir={v['viewDir']}")
                print(f"    clip_handle={v['clip_handle']}")
        
        # Check viewDirections (for non-Z viewports)
        non_z = [v for v in active if abs(v['viewDir'][2] - 1.0) > 0.01 and 
                 not (abs(v['viewDir'][0]) < 1e-6 and abs(v['viewDir'][1]) < 1e-6)]
        print(f"\nNon-Z view direction: {len(non_z)}")
        if non_z:
            unique_dirs = set(v['viewDir'] for v in non_z)
            print(f"  Unique view dirs: {unique_dirs}")
        
        # Sample a few for context
        if active:
            print(f"\nSample of active viewports (first 3):")
            for v in active[:3]:
                print(f"  handle={v['handle']}, twist={v['twist_raw']:.4f}, dir={v['viewDir']}, center={v['center']}")

    print(f"\n{'='*70}")
    print("TWIST FORENSIC COMPLETE")
    print(f"{'='*70}")

if __name__ == '__main__':
    main()

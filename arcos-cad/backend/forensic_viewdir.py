#!/usr/bin/env python3
"""
PHASE 5.16C-C — VIEW DIRECTION FORENSIC ANALYSIS
Inspect viewDirection for every active VIEWPORT in all DXF files.
"""
import os, math

DXF_FILES = [
    r"E:\viewer_v2\dxf_files\TERMINALDESIGN PART 2.dxf",
    r"E:\viewer_v2\dxf_files\F2841747.dxf",
]

def parse_viewports_raw(filepath):
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
            def f(k, d=0.0):
                try: return float(vp.get(k, d))
                except: return d
            handle  = vp.get('5', 'N/A')
            status  = int(vp.get('68', '0'))
            cx, cy  = f('10'), f('20')
            width   = f('40')
            height  = f('41')
            vcx,vcy = f('12'), f('22')
            vh      = f('45')
            vdx,vdy,vdz = f('16'), f('26'), f('36', 1.0)
            twist   = f('51')
            clip_h  = vp.get('340', '0')
            # perspective: bit 0x10 of status or separate flag
            persp   = bool(status & 0x02)
            viewports.append({
                'handle': handle, 'status': status,
                'center': (cx, cy), 'width': width, 'height': height,
                'viewCenter': (vcx, vcy), 'viewHeight': vh,
                'viewDir': (vdx, vdy, vdz),
                'twist': twist, 'clipHandle': clip_h, 'perspective': persp,
            })
        else:
            i += 1
    return viewports

def vec_len(v):
    return math.sqrt(sum(x*x for x in v))

def main():
    for dxf_path in DXF_FILES:
        if not os.path.exists(dxf_path):
            print(f"SKIP: {dxf_path}"); continue
        fname = os.path.basename(dxf_path)
        print(f"\n{'='*70}\nFILE: {fname}\n{'='*70}")
        vps = parse_viewports_raw(dxf_path)
        active = [v for v in vps if v['status'] & 0x01]
        print(f"Total VPs: {len(vps)}, Active: {len(active)}")

        z_view   = [v for v in active if abs(v['viewDir'][0]) < 1e-6 and abs(v['viewDir'][1]) < 1e-6 and v['viewDir'][2] > 0]
        non_z    = [v for v in active if v not in z_view]

        print(f"\nZ-view (0,0,+):   {len(z_view)}")
        print(f"Non-Z viewDir:    {len(non_z)}")

        unique_dirs = {}
        for v in active:
            d = v['viewDir']
            mag = vec_len(d)
            key = (round(d[0]/mag,4) if mag>0 else 0,
                   round(d[1]/mag,4) if mag>0 else 0,
                   round(d[2]/mag,4) if mag>0 else 1)
            if key not in unique_dirs:
                unique_dirs[key] = []
            unique_dirs[key].append(v['handle'])

        print(f"\nUnique normalized viewDirections:")
        for d, handles in unique_dirs.items():
            print(f"  {d}  -> {len(handles)} VPs, e.g. handles: {handles[:3]}")

        if non_z:
            print(f"\nNon-Z VIEWPORT details:")
            for v in non_z:
                d = v['viewDir']
                mag = vec_len(d)
                print(f"  handle={v['handle']}")
                print(f"    viewDir={d}  mag={mag:.4f}")
                print(f"    center={v['center']}  w={v['width']:.3f}  h={v['height']:.3f}")
                print(f"    viewCenter={v['viewCenter']}  viewHeight={v['viewHeight']:.3f}")
                print(f"    twist={v['twist']:.6f}  perspective={v['perspective']}")

        print(f"\nSample active VPs (first 5):")
        for v in active[:5]:
            d = v['viewDir']
            print(f"  handle={v['handle']}  dir={d}  twist={v['twist']:.4f}  vcH={v['viewHeight']:.4f}")

    print(f"\n{'='*70}\nFORENCIS COMPLETE\n{'='*70}")

if __name__ == '__main__':
    main()

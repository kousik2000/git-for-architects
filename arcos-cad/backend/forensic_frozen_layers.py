#!/usr/bin/env python3
"""
PHASE 5.16C-D — VIEWPORT FROZEN LAYER FORENSIC ANALYSIS
Inspect every active PaperSpace VIEWPORT for viewport-specific frozen layer data.
Uses both ezdxf API and raw DXF parsing.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ezdxf

DXF_PATH = r"E:\viewer_v2\dxf_files\TERMINALDESIGN PART 2.dxf"

def analyze_with_ezdxf():
    doc = ezdxf.readfile(DXF_PATH)
    
    print("=" * 70)
    print("EZDXF API — Viewport frozen layers")
    print("=" * 70)

    total_with_frozen = 0
    
    for layout_name in doc.layout_names():
        if layout_name == 'Model':
            continue
        layout = doc.layout(layout_name)
        
        print(f"\n--- Layout: {layout_name} ---")
        vp_count = 0
        vp_with_frozen = 0
        all_frozen_layers = set()
        
        for entity in layout:
            if entity.dxftype() != 'VIEWPORT':
                continue
            vp_count += 1
            
            handle = entity.dxf.handle
            status = entity.dxf.status if entity.dxf.hasattr('status') else 0
            active = bool(status & 0x01)
            
            # ezdxf exposes frozen_layers as a property
            frozen = []
            try:
                frozen = list(entity.frozen_layers)
            except Exception as ex:
                try:
                    frozen = list(entity.get_frozen_layer_names())
                except Exception as ex2:
                    frozen = []
            
            if frozen:
                vp_with_frozen += 1
                total_with_frozen += 1
                all_frozen_layers.update(frozen)
                print(f"  VP handle={handle} active={active} frozenLayers={frozen}")
            else:
                print(f"  VP handle={handle} active={active} frozenLayers=[]")
        
        print(f"  Total VPs: {vp_count}, with frozen layers: {vp_with_frozen}")
        print(f"  Unique frozen layers: {sorted(all_frozen_layers)}")
    
    print(f"\nTotal VPs with frozen layers across all layouts: {total_with_frozen}")

def analyze_raw_xdata():
    """Raw parse: look for viewport frozen layer data in XDATA and group codes."""
    print("\n" + "=" * 70)
    print("RAW DXF PARSE — Group codes + XDATA in VIEWPORTs")
    print("=" * 70)
    
    with open(DXF_PATH, 'r', errors='replace') as f:
        lines = f.readlines()
    
    pairs = []
    i = 0
    while i < len(lines) - 1:
        pairs.append((lines[i].strip(), lines[i+1].strip()))
        i += 2
    
    # Find all VIEWPORT entities and collect ALL their group codes including XDATA
    viewports = []
    i = 0
    while i < len(pairs):
        code, value = pairs[i]
        if code == '0' and value == 'VIEWPORT':
            vp = {'codes': {}, 'xdata': [], '_multi': {}}
            i += 1
            current_xapp = None
            while i < len(pairs):
                c, v = pairs[i]
                if c == '0':
                    break
                if c == '1001':
                    current_xapp = v
                    vp['xdata'].append({'app': v, 'data': []})
                elif current_xapp:
                    vp['xdata'][-1]['data'].append((c, v))
                else:
                    # Store with list handling for repeated codes
                    if c in vp['_multi']:
                        vp['_multi'][c].append(v)
                    else:
                        vp['_multi'][c] = [v]
                    vp['codes'][c] = v  # keep last for simple access
                i += 1
            viewports.append(vp)
        else:
            i += 1
    
    print(f"Found {len(viewports)} VIEWPORT entities")
    
    found_any_frozen = False
    for idx, vp in enumerate(viewports):
        codes = vp['codes']
        handle = codes.get('5', 'N/A')
        status = int(codes.get('68', '0'))
        active = bool(status & 0x01)
        
        # DXF frozen layers in VIEWPORTs:
        # Standard: group code 331 = layer handle (frozen in this VP)
        # Some versions: group code 341, 343
        # XDATA from ACAD_REACTORS or similar
        
        # Check for group code 331 (frozen layer handle in viewport)
        frozen_handles_331 = vp['_multi'].get('331', [])
        frozen_handles_341 = vp['_multi'].get('341', [])
        frozen_handles_343 = vp['_multi'].get('343', [])
        
        # Other codes sometimes used
        code_332 = vp['_multi'].get('332', [])
        
        has_frozen = any([frozen_handles_331, frozen_handles_341, frozen_handles_343])
        
        if has_frozen:
            found_any_frozen = True
            print(f"\n  *** VP #{idx+1} handle={handle} active={active} HAS FROZEN:")
            if frozen_handles_331: print(f"      Code 331 (frozen layer handles): {frozen_handles_331}")
            if frozen_handles_341: print(f"      Code 341: {frozen_handles_341}")
            if frozen_handles_343: print(f"      Code 343: {frozen_handles_343}")
        
        # Print XDATA that may contain frozen layer info
        if vp['xdata']:
            for xd in vp['xdata']:
                # Look for layer-related codes in xdata
                layer_codes = [(c,v) for c,v in xd['data'] if c in ('1003', '1005', '1000')]
                if layer_codes:
                    print(f"\n  VP #{idx+1} handle={handle} XDATA[{xd['app']}] layer codes:")
                    for c, v in layer_codes:
                        print(f"      {c}: {v}")
    
    if not found_any_frozen:
        print("\nNO VIEWPORTS HAVE VIEWPORT-SPECIFIC FROZEN LAYERS.")
        print("All frozenLayers = [] in this DXF.")
    
    # Look at layer table for handles
    print("\n" + "=" * 70)
    print("LAYER HANDLES (for cross-reference)")
    print("=" * 70)
    i = 0
    in_layer_table = False
    layer_handles = {}
    while i < len(pairs):
        c, v = pairs[i]
        if c == '0' and v == 'LAYER':
            # next code 5 = handle, code 2 = name
            h = None; name = None
            j = i + 1
            while j < len(pairs):
                cc, vv = pairs[j]
                if cc == '0': break
                if cc == '5': h = vv
                if cc == '2': name = vv
                j += 1
            if h and name:
                layer_handles[h] = name
        i += 1
    
    print(f"Total layers: {len(layer_handles)}")
    if len(layer_handles) < 30:
        for h, name in sorted(layer_handles.items(), key=lambda x: x[1]):
            print(f"  {h}: {name}")

if __name__ == '__main__':
    analyze_with_ezdxf()
    analyze_raw_xdata()
    print("\n" + "=" * 70)
    print("FORENSIC COMPLETE")
    print("=" * 70)

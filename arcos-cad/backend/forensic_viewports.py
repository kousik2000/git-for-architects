#!/usr/bin/env python3
"""
PHASE 5.16C-A — VIEWPORT FORENSIC ANALYSIS
Inspects every VIEWPORT in TERMINALDESIGN PART 2.dxf
"""

import sys
import os
import json

# Add backend to path so we can potentially import ezdxf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import ezdxf
    from ezdxf.entities import Viewport
    HAS_EZDXF = True
except ImportError:
    HAS_EZDXF = False
    print("ezdxf not available, using raw DXF parsing")

DXF_PATH = r"E:\viewer_v2\dxf_files\TERMINALDESIGN PART 2.dxf"

def analyze_with_ezdxf():
    """Analyze viewports using ezdxf library."""
    doc = ezdxf.readfile(DXF_PATH)
    
    results = {
        "layouts": {}
    }
    
    print("=" * 80)
    print("VIEWPORT FORENSIC ANALYSIS — TERMINALDESIGN PART 2.dxf")
    print("=" * 80)
    
    all_entities = {}
    # Build a handle-to-entity map for the whole document
    for block in doc.blocks:
        for entity in block:
            if hasattr(entity, 'dxf') and hasattr(entity.dxf, 'handle'):
                h = entity.dxf.handle
                all_entities[h] = entity
    
    for layout_name in doc.layout_names():
        layout = doc.layout(layout_name)
        print(f"\n{'='*60}")
        print(f"LAYOUT: {layout_name}")
        print(f"{'='*60}")
        
        viewports = []
        
        for entity in layout:
            if entity.dxftype() == 'VIEWPORT':
                vp = entity
                dxf = vp.dxf
                
                # Basic viewport info
                handle = dxf.handle if hasattr(dxf, 'handle') else 'N/A'
                status = dxf.status if hasattr(dxf, 'status') else 0
                center = (dxf.center.x, dxf.center.y, dxf.center.z) if hasattr(dxf, 'center') else None
                width = dxf.width if hasattr(dxf, 'width') else None
                height = dxf.height if hasattr(dxf, 'height') else None
                
                view_center = (dxf.view_center_point.x, dxf.view_center_point.y) if hasattr(dxf, 'view_center_point') else None
                view_height = dxf.view_height if hasattr(dxf, 'view_height') else None
                view_direction = (dxf.view_direction_vector.x, dxf.view_direction_vector.y, dxf.view_direction_vector.z) if hasattr(dxf, 'view_direction_vector') else None
                twist_angle = dxf.snap_angle if hasattr(dxf, 'snap_angle') else None
                
                # Check for twist angle specifically (group code 51)
                twist = None
                try:
                    twist = vp.dxf.get('twist_angle', None)
                except:
                    pass
                
                # Clipping boundary handle (group code 340)
                clip_handle = None
                try:
                    clip_handle = dxf.clipping_boundary_handle
                except:
                    pass
                
                # Also try raw access
                if clip_handle is None:
                    try:
                        clip_handle = dxf.get('clipping_boundary_handle', None)
                    except:
                        pass
                
                # Frozen layers
                frozen_layers = []
                try:
                    frozen_layers = list(vp.frozen_layers)
                except:
                    pass
                
                # Perspective mode (bit 512 of status flags)
                perspective = bool(status & 0x20) if status else False
                
                # Active status (bit 0 of status)
                is_active = bool(status & 0x01) if status else False
                
                print(f"\n  VIEWPORT handle={handle}")
                print(f"    Status flags: {status} (hex: {hex(status) if status else '0x0'})")
                print(f"    Active: {is_active}")
                print(f"    Center (PaperSpace): {center}")
                print(f"    Width: {width}")
                print(f"    Height: {height}")
                print(f"    View Center (Modelspace): {view_center}")
                print(f"    View Height (Modelspace): {view_height}")
                print(f"    View Direction: {view_direction}")
                print(f"    Twist angle: {twist}")
                print(f"    Clipping boundary handle: {clip_handle}")
                print(f"    Frozen layers: {frozen_layers}")
                print(f"    Perspective: {perspective}")
                
                # Investigate clipping boundary entity
                clip_info = None
                if clip_handle and clip_handle != '0':
                    print(f"\n    >>> Investigating clipping boundary entity (handle={clip_handle})...")
                    clip_entity = all_entities.get(clip_handle)
                    if clip_entity is None:
                        # Try doc.entitydb
                        try:
                            clip_entity = doc.entitydb.get(clip_handle)
                        except:
                            pass
                    
                    if clip_entity:
                        clip_type = clip_entity.dxftype()
                        print(f"    Clipping boundary type: {clip_type}")
                        
                        points = []
                        if clip_type == 'LWPOLYLINE':
                            pts = list(clip_entity.get_points())
                            points = [(p[0], p[1]) for p in pts]
                            closed = clip_entity.closed
                            print(f"    LWPOLYLINE: {len(points)} points, closed={closed}")
                            print(f"    Points: {points[:10]}{'...' if len(points) > 10 else ''}")
                        elif clip_type == 'POLYLINE':
                            pts = list(clip_entity.points())
                            points = [(p.x, p.y) for p in pts]
                            print(f"    POLYLINE: {len(points)} points")
                            print(f"    Points: {points[:10]}{'...' if len(points) > 10 else ''}")
                        elif clip_type == 'SPLINE':
                            print(f"    SPLINE control points: {len(list(clip_entity.control_points))}")
                        else:
                            print(f"    Unknown type, dxf attrs: {dir(clip_entity.dxf)}")
                        
                        clip_info = {
                            "handle": clip_handle,
                            "type": clip_type,
                            "points": points
                        }
                    else:
                        print(f"    WARNING: Could not find entity with handle {clip_handle}")
                        clip_info = {"handle": clip_handle, "type": "NOT_FOUND", "points": []}
                
                vp_info = {
                    "handle": handle,
                    "layout": layout_name,
                    "status": status,
                    "active": is_active,
                    "center": center,
                    "width": width,
                    "height": height,
                    "viewCenter": view_center,
                    "viewHeight": view_height,
                    "viewDirection": view_direction,
                    "twist": twist,
                    "clipHandle": clip_handle,
                    "clipInfo": clip_info,
                    "frozenLayers": frozen_layers,
                    "perspective": perspective
                }
                viewports.append(vp_info)
        
        results["layouts"][layout_name] = viewports
        print(f"\n  Total viewports in {layout_name}: {len(viewports)}")
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    total_vps = 0
    rect_vps = 0
    poly_vps = 0
    
    for layout_name, vps in results["layouts"].items():
        for vp in vps:
            total_vps += 1
            if vp["clipInfo"] and vp["clipInfo"]["type"] not in ["NOT_FOUND"]:
                poly_vps += 1
                print(f"  POLYGONAL: Layout={layout_name}, handle={vp['handle']}, clipType={vp['clipInfo']['type']}, nPoints={len(vp['clipInfo']['points'])}")
            else:
                rect_vps += 1
                print(f"  RECTANGULAR: Layout={layout_name}, handle={vp['handle']}")
    
    print(f"\nTotal VIEWPORTs: {total_vps}")
    print(f"Rectangular: {rect_vps}")
    print(f"Polygonal: {poly_vps}")
    
    return results

def analyze_raw():
    """Analyze DXF using raw text parsing as fallback."""
    print("Using raw DXF parsing...")
    
    viewports = []
    current_vp = None
    in_viewport = False
    
    with open(DXF_PATH, 'r', errors='replace') as f:
        lines = f.readlines()
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line == '0' and i + 1 < len(lines) and lines[i+1].strip() == 'VIEWPORT':
            in_viewport = True
            current_vp = {"raw_codes": {}}
            i += 2
            continue
        
        if in_viewport:
            if line == '0':  # End of entity
                if current_vp:
                    viewports.append(current_vp)
                in_viewport = False
                current_vp = None
                i += 1
                continue
            
            code = line
            if i + 1 < len(lines):
                value = lines[i+1].strip()
                current_vp["raw_codes"][code] = value
            i += 2
            continue
        
        i += 1
    
    if current_vp:
        viewports.append(current_vp)
    
    print(f"Found {len(viewports)} VIEWPORT entities")
    
    for idx, vp in enumerate(viewports):
        codes = vp["raw_codes"]
        handle = codes.get("5", "N/A")
        status = codes.get("68", "0")
        clip_handle = codes.get("340", None)
        
        print(f"\nVIEWPORT #{idx+1}: handle={handle}, status={status}, clip_handle={clip_handle}")
        # Print relevant group codes
        for k in ["10", "20", "30", "40", "41", "12", "22", "45", "16", "26", "36", "51", "68", "69", "340"]:
            if k in codes:
                print(f"  Code {k}: {codes[k]}")
    
    return viewports

if __name__ == "__main__":
    if HAS_EZDXF:
        results = analyze_with_ezdxf()
        # Save results
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "viewport_forensic.json")
        with open(out_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\nResults saved to: {out_path}")
    else:
        analyze_raw()

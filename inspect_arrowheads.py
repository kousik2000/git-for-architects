import ezdxf
import sys

def inspect_arrowheads(filepath, num_samples=10):
    print(f"Loading {filepath} ...")
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    dims = [e for e in msp if e.dxftype() == 'DIMENSION']
    leaders = [e for e in msp if e.dxftype() in ('LEADER', 'MLEADER')]
    
    print(f"Found {len(dims)} DIMENSION and {len(leaders)} LEADER/MLEADER in Modelspace")
    
    print("\n--- SAMPLE DIMENSIONS ---")
    for i, dim in enumerate(dims[:num_samples]):
        print(f"\n[DIMENSION {dim.dxf.handle}] Layer: {dim.dxf.layer}")
        dimstyle = doc.dimstyles.get(dim.dxf.dimstyle)
        if dimstyle:
            print(f"  DIMSTYLE: {dimstyle.dxf.name}")
            print(f"  DIMBLK: {dimstyle.dxf.get('dimblk', 'Default')}")
            print(f"  DIMBLK1: {dimstyle.dxf.get('dimblk1', 'Default')}")
            print(f"  DIMBLK2: {dimstyle.dxf.get('dimblk2', 'Default')}")
            print(f"  DIMASZ: {dimstyle.dxf.get('dimasz', 'N/A')}")
            print(f"  DIMTSZ: {dimstyle.dxf.get('dimtsz', 'N/A')}")
        else:
            print("  DIMSTYLE: Not found")
            
        print("  Virtual Entities:")
        try:
            for v in dim.virtual_entities():
                if v.dxftype() == 'INSERT':
                    print(f"    - {v.dxftype()} Block: {v.dxf.name} at {v.dxf.insert} scale: {v.dxf.xscale}")
                elif v.dxftype() == 'SOLID':
                    print(f"    - {v.dxftype()} vertices: {[v.dxf.vtx0, v.dxf.vtx1, v.dxf.vtx2, getattr(v.dxf, 'vtx3', None)]}")
                elif v.dxftype() == 'LINE':
                    print(f"    - {v.dxftype()} from {v.dxf.start} to {v.dxf.end}")
                else:
                    print(f"    - {v.dxftype()}")
        except Exception as e:
            print(f"    Error getting virtual entities: {e}")

    print("\n--- SAMPLE LEADERS ---")
    for i, leader in enumerate(leaders[:num_samples]):
        print(f"\n[{leader.dxftype()} {leader.dxf.handle}] Layer: {leader.dxf.layer}")
        if leader.dxftype() == 'LEADER':
            dimstyle = doc.dimstyles.get(leader.dxf.dimstyle)
            if dimstyle:
                print(f"  DIMSTYLE: {dimstyle.dxf.name}")
                print(f"  DIMBLK: {dimstyle.dxf.get('dimblk', 'Default')}")
        
        print("  Virtual Entities:")
        try:
            for v in leader.virtual_entities():
                if v.dxftype() == 'INSERT':
                    print(f"    - {v.dxftype()} Block: {v.dxf.name} at {v.dxf.insert} scale: {v.dxf.xscale}")
                elif v.dxftype() == 'SOLID':
                    print(f"    - {v.dxftype()} vertices: {[v.dxf.vtx0, v.dxf.vtx1, v.dxf.vtx2, getattr(v.dxf, 'vtx3', None)]}")
                elif v.dxftype() == 'LINE':
                    print(f"    - {v.dxftype()} from {v.dxf.start} to {v.dxf.end}")
                else:
                    print(f"    - {v.dxftype()}")
        except Exception as e:
            print(f"    Error getting virtual entities: {e}")

inspect_arrowheads('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

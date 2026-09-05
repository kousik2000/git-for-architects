import ezdxf
import math

def run_forensic(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    print("--- 1. FIND MISSING ARROWHEADS ---")
    missing = []
    working = []
    
    for e in msp:
        if e.dxftype() in ('LEADER', 'DIMENSION'):
            dimstyle = doc.dimstyles.get(e.dxf.dimstyle)
            dimblk = dimstyle.dxf.get('dimblk', 'Default ("")') if dimstyle else 'Unknown'
            
            if dimblk in ('', 'Default ("")'):
                missing.append(e)
            else:
                working.append(e)
                
    print(f"Found {len(missing)} missing and {len(working)} working.")
    
    print("\n10 Missing Arrowheads:")
    for m in missing[:10]:
        print(f"Handle: {m.dxf.handle}, Type: {m.dxftype()}, Layer: {m.dxf.layer}, Style: {m.dxf.dimstyle}")
        if m.dxftype() == 'LEADER':
            print(f"  Vertices: {m.vertices}")
            
    print("\n--- 3. INSPECT DIMSTYLE ---")
    for dimstyle_name in set([m.dxf.dimstyle for m in missing[:5]]):
        dimstyle = doc.dimstyles.get(dimstyle_name)
        if dimstyle:
            print(f"DIMSTYLE {dimstyle_name}:")
            print(f"  DIMBLK: {dimstyle.dxf.get('dimblk', 'N/A')}")
            print(f"  DIMASZ: {dimstyle.dxf.get('dimasz', 'N/A')}")
            print(f"  DIMSCALE: {dimstyle.dxf.get('dimscale', 'N/A')}")

    print("\n--- 4. INSPECT LEADER / MLEADER ---")
    m1 = missing[0]
    print(f"Leader {m1.dxf.handle} Overrides:")
    if m1.has_xdata('ACAD'):
        print("  XDATA:", m1.get_xdata('ACAD'))
        
    print("\n--- 5. INSPECT virtual_entities() ---")
    print(f"Virtual entities for {m1.dxftype()} {m1.dxf.handle}:")
    for v in m1.virtual_entities():
        print(f"  - {v.dxftype()}")
        
    w1 = working[0]
    print(f"\nVirtual entities for {w1.dxftype()} {w1.dxf.handle}:")
    for v in w1.virtual_entities():
        if v.dxftype() == 'INSERT':
            print(f"  - {v.dxftype()} (Block: {v.dxf.name})")
        else:
            print(f"  - {v.dxftype()}")
            
    print("\n--- 6. INSPECT SOLID ENTITIES ---")
    solids = list(msp.query('SOLID'))
    print(f"Total SOLIDs: {len(solids)}")
    for s in solids[:5]:
        print(f"SOLID Handle: {s.dxf.handle}, Layer: {s.dxf.layer}")

run_forensic('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

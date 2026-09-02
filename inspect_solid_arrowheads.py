import ezdxf

def inspect_solid_arrowheads(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    solids = [e for e in msp if e.dxftype() == 'SOLID']
    print(f"Total SOLID entities in modelspace: {len(solids)}")
    if len(solids) > 0:
        print("First 5 SOLIDs:")
        for s in solids[:5]:
            print(f"  Handle: {s.dxf.handle}, Layer: {s.dxf.layer}")
            print(f"    Vtx0: {s.dxf.vtx0}")
            print(f"    Vtx1: {s.dxf.vtx1}")
            print(f"    Vtx2: {s.dxf.vtx2}")
            if hasattr(s.dxf, 'vtx3'):
                print(f"    Vtx3: {s.dxf.vtx3}")

    print("\n--- CHECKING DIMENSION ARROWHEADS ---")
    for dim in msp.query('DIMENSION'):
        try:
            has_solid = False
            for v in dim.virtual_entities():
                if v.dxftype() == 'SOLID':
                    has_solid = True
                    break
            if has_solid:
                print(f"DIMENSION {dim.dxf.handle} has a SOLID arrowhead!")
                break
        except:
            pass

    print("\n--- CHECKING LEADER ARROWHEADS ---")
    for leader in msp.query('LEADER'):
        try:
            has_solid = False
            lines = 0
            for v in leader.virtual_entities():
                if v.dxftype() == 'SOLID':
                    has_solid = True
                if v.dxftype() == 'LINE':
                    lines += 1
            if not has_solid:
                print(f"LEADER {leader.dxf.handle} has {lines} LINEs but NO SOLID. DIMSTYLE: {leader.dxf.dimstyle}")
        except:
            pass

inspect_solid_arrowheads('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

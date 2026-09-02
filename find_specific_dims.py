import ezdxf

def find_specific_dims(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    search_texts = ["73.82", "24.57", "152.56"]
    
    print("\n--- FINDING SPECIFIC DIMENSIONS ---")
    for dim in msp.query('DIMENSION LEADER MLEADER'):
        try:
            matched = False
            for v in dim.virtual_entities():
                if v.dxftype() in ('MTEXT', 'TEXT'):
                    text = v.dxf.text if hasattr(v.dxf, 'text') else v.text
                    for st in search_texts:
                        if st in text:
                            matched = True
                            break
            
            if matched:
                print(f"\n[{dim.dxftype()} {dim.dxf.handle}] Layer: {dim.dxf.layer}")
                dimstyle = doc.dimstyles.get(dim.dxf.dimstyle)
                if dimstyle:
                    print(f"  DIMSTYLE: {dimstyle.dxf.name}")
                    print(f"  DIMBLK: {dimstyle.dxf.get('dimblk', 'Default')}")
                    print(f"  DIMASZ: {dimstyle.dxf.get('dimasz', 'N/A')}")
                
                print("  Virtual Entities:")
                for v in dim.virtual_entities():
                    if v.dxftype() == 'INSERT':
                        print(f"    - {v.dxftype()} Block: {v.dxf.name} at {v.dxf.insert}")
                    elif v.dxftype() == 'SOLID':
                        print(f"    - {v.dxftype()} vertices: {[v.dxf.vtx0, v.dxf.vtx1, v.dxf.vtx2, getattr(v.dxf, 'vtx3', None)]}")
                    elif v.dxftype() == 'LINE':
                        print(f"    - {v.dxftype()} from {v.dxf.start} to {v.dxf.end}")
                    else:
                        print(f"    - {v.dxftype()}")
        except Exception as e:
            pass

find_specific_dims('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

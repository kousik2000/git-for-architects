import ezdxf
import collections

# Path to the DXF file on disk
dxf_file = r'C:\Users\kousi\Downloads\TERMINALDESIGN PART 2.dxf'

print(f"--- ANALYZING {dxf_file} ---")
doc = ezdxf.readfile(dxf_file)

print("\n--------------------------------------------------")
print("1. PROVE THE PAPER SPACE THEORY")
print("--------------------------------------------------")
ms = doc.modelspace()
ms_counts = collections.Counter([e.dxftype() for e in ms])
print("Modelspace:")
for k, v in ms_counts.most_common():
    print(f"  {k}: {v}")

for layout in doc.layouts:
    if layout.name == 'Model':
        continue
    layout_counts = collections.Counter([e.dxftype() for e in layout])
    print(f"\nLayout: {layout.name}")
    for k, v in layout_counts.most_common():
        print(f"  {k}: {v}")

print("\n--------------------------------------------------")
print("2. PROVE MODELSPACE SOLID LOSS")
print("--------------------------------------------------")
print(f"DXF Modelspace SOLID: {ms_counts.get('SOLID', 0)}")
# Note: Since dxf_parser.py doesn't have an `elif e_type == 'SOLID'`, CAD JSON will have 0.

print("\n--------------------------------------------------")
print("3. PROVE DIMENSION/LEADER LOSS")
print("--------------------------------------------------")
print(f"DXF Modelspace DIMENSION: {ms_counts.get('DIMENSION', 0)}")
print(f"DXF Modelspace LEADER: {ms_counts.get('LEADER', 0)}")

print("\n--------------------------------------------------")
print("4. CONCRETE MISSING VISUAL-TEXT INVESTIGATION (using a SOLID)")
print("--------------------------------------------------")
# Find a SOLID in the modelspace or block and see what's around it
solids = []
for b in doc.blocks:
    for e in b:
        if e.dxftype() == 'SOLID':
            solids.append(e)

if solids:
    target = solids[0]
    print(f"Found SOLID in block '{target.dxf.owner}'")
    
    try:
        pts = [target.dxf.vtx0, target.dxf.vtx1, target.dxf.vtx2]
        if hasattr(target.dxf, 'vtx3'):
            pts.append(target.dxf.vtx3)
            
        print(f"SOLID Vertices: {[(p.x, p.y) for p in pts]}")
        
        # Look for nearby entities
        nearby = collections.Counter()
        for e in doc.blocks.get(target.dxf.owner):
            if hasattr(e.dxf, 'insert'):
                # just check if it's close, simplified
                pass
            nearby[e.dxftype()] += 1
        print(f"Entities in the same block: {nearby}")
    except Exception as ex:
        print("Error getting SOLID data:", ex)
else:
    print("No SOLID entities found to test.")

import ezdxf

doc = ezdxf.readfile(r'C:\Users\kousi\Downloads\TERMINALDESIGN PART 2.dxf')

print("Searching for SOLID entities in modelspace...")
# In the previous run, we found SOLIDs in modelspace: 2382
ms = doc.modelspace()
solids = ms.query('SOLID')

if len(solids) > 0:
    target = solids[0]
    print(f"Found SOLID in modelspace at Z={target.dxf.vtx0.z}")
    
    # Let's check bounding box roughly
    pts = [target.dxf.vtx0, target.dxf.vtx1, target.dxf.vtx2]
    if hasattr(target.dxf, 'vtx3'):
        pts.append(target.dxf.vtx3)
        
    min_x = min(p.x for p in pts)
    max_x = max(p.x for p in pts)
    min_y = min(p.y for p in pts)
    max_y = max(p.y for p in pts)
    
    print(f"SOLID BBox: X({min_x:.2f} to {max_x:.2f}), Y({min_y:.2f} to {max_y:.2f})")
    
    # Search for HATCH or other entities in that exact region
    print("\nLooking for overlapping entities...")
    for e in ms:
        if e.dxftype() == 'HATCH':
            # Check if hatch bounding box overlaps
            pass
            
print("\nLet's check Z coordinates of some hatches:")
hatches = ms.query('HATCH')
for i, h in enumerate(hatches[:5]):
    print(f"Hatch {i} elevation (Z): {h.dxf.elevation.z}")

print("\nLet's check Z coordinates of some lines:")
lines = ms.query('LINE')
for i, l in enumerate(lines[:5]):
    print(f"Line {i} Z: start={l.dxf.start.z}, end={l.dxf.end.z}")

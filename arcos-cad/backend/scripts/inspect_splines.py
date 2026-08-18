import ezdxf

doc = ezdxf.readfile(r"E:\viewer_v2\dxf_files\F2841747.dxf")

splines = []
for block in doc.blocks:
    for entity in block:
        if entity.dxftype() == 'SPLINE':
            splines.append({
                'block': block.name,
                'entity': entity
            })

print(f"Total SPLINEs found in blocks: {len(splines)}")

degrees = {}
control_points_counts = {}
knots_counts = {}
weights_counts = {}
fit_points_counts = {}
rational_flags = {}
closed_flags = {}

for s in splines:
    e = s['entity']
    deg = e.dxf.degree
    degrees[deg] = degrees.get(deg, 0) + 1
    
    cp_len = len(e.control_points)
    control_points_counts[cp_len] = control_points_counts.get(cp_len, 0) + 1
    
    k_len = len(e.knots)
    knots_counts[k_len] = knots_counts.get(k_len, 0) + 1
    
    w_len = len(e.weights)
    weights_counts[w_len] = weights_counts.get(w_len, 0) + 1
    
    f_len = len(e.fit_points)
    fit_points_counts[f_len] = fit_points_counts.get(f_len, 0) + 1
    
    r = bool(e.dxf.flags & ezdxf.lldxf.const.SPLINE_RATIONAL)
    rational_flags[r] = rational_flags.get(r, 0) + 1
    
    c = bool(e.closed)
    closed_flags[c] = closed_flags.get(c, 0) + 1

print("\n--- SPLINE DXF PROPERTIES ---")
print(f"Degrees: {degrees}")
print(f"Control Points counts: {control_points_counts}")
print(f"Knots counts: {knots_counts}")
print(f"Weights counts: {weights_counts}")
print(f"Fit points counts: {fit_points_counts}")
print(f"Rational (has weights): {rational_flags}")
print(f"Closed: {closed_flags}")

if splines:
    e = splines[0]['entity']
    print("\n--- SAMPLE KNOT VECTOR (First SPLINE) ---")
    print(f"Knots: {list(e.knots)}")
    
    print("\n--- BEZIER EQUIVALENCE VERIFICATION ---")
    all_equivalent = True
    for s in splines:
        ent = s['entity']
        k = list(ent.knots)
        if len(k) == 8:
            if not (k[0] == k[1] == k[2] == k[3] and k[4] == k[5] == k[6] == k[7]):
                all_equivalent = False
        else:
            all_equivalent = False
            
    print(f"All 208 SPLINEs are Cubic Bezier equivalent? {all_equivalent}")

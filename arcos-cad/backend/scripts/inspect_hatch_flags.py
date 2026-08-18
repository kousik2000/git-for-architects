import ezdxf
from ezdxf.entities.boundary_paths import EdgePath, PolylinePath

doc = ezdxf.readfile(r"dxf_files\F2841747.dxf")
msp = doc.modelspace()
hatches = [e for e in msp if e.dxftype() == "HATCH"]

# Check EdgePath flags distribution
flag_dist = {}
for h in hatches:
    for path in h.paths:
        flags = path.path_type_flags
        flag_dist[flags] = flag_dist.get(flags, 0) + 1

print("path_type_flags distribution:", flag_dist)
print()

# Check a hatch with multiple paths for hole detection
multi_path_hatches = [h for h in hatches if len(h.paths) > 1]
print(f"HATCHes with multiple paths: {len(multi_path_hatches)}")
if multi_path_hatches:
    h = multi_path_hatches[0]
    print("  Path count:", len(h.paths))
    for i, path in enumerate(h.paths):
        print(f"  Path {i}: flags={path.path_type_flags}, type={type(path).__name__}")
        if hasattr(path, "edges"):
            print(f"    edges: {len(path.edges)}")
            for j, e in enumerate(path.edges[:2]):
                print(f"    edge {j}: {type(e).__name__} start={e.start} end={e.end}")

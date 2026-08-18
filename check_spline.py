import ezdxf

# Check what block entities have SPLINEs
doc = ezdxf.readfile("F2841747_django_test.dxf")

for block in doc.blocks:
    for e in block:
        if e.dxftype() == "SPLINE":
            print(f"SPLINE in block {block.name!r}")
            for pt in e.control_points:
                print(f"  control_point type: {type(pt).__name__}, value: {pt}")
            break

# Also check the SPLINE control_points attribute access
doc2 = ezdxf.new("R2010")
msp2 = doc2.modelspace()
spline = msp2.add_spline([(0,0,0),(1,1,0),(2,0,0)])
print("Spline control_points type:")
for pt in spline.control_points:
    print(f"  {type(pt).__name__}: {pt}")
    # Try both .x and [0]
    print(f"  via [0]: {pt[0]}, via .x: {getattr(pt, 'x', 'NO .x')}")

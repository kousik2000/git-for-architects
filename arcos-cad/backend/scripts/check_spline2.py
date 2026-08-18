import ezdxf

doc2 = ezdxf.new("R2010")
msp2 = doc2.modelspace()
spline = msp2.add_spline([(0,0,0),(5,3,0),(10,0,0)])
print("Spline degree:", spline.dxf.degree)
cps = list(spline.control_points)
print("control_points count:", len(cps))
if cps:
    pt = cps[0]
    print("type:", type(pt).__name__)
    print("value:", pt)
    print("pt[0]:", pt[0])
    print("hasattr x:", hasattr(pt, "x"))
    if hasattr(pt, "x"):
        print("pt.x:", pt.x)
    else:
        print("No .x -- use pt[0], pt[1], pt[2]")

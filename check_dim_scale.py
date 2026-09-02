import ezdxf

def check_dim_scale(filepath):
    doc = ezdxf.readfile(filepath)
    dimstyle = doc.dimstyles.get('STANDARD$7')
    if dimstyle:
        print(f"DIMASZ: {dimstyle.dxf.get('dimasz', 'Default')}")
        print(f"DIMSCALE: {dimstyle.dxf.get('dimscale', 'Default')}")
    else:
        print("STANDARD$7 not found")

check_dim_scale('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

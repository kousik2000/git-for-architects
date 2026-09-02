import ezdxf

def inspect_leader_dxf(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    for leader in msp.query('LEADER')[:1]:
        print("DXF Attributes:")
        for k, v in leader.dxf.all_existing_dxf_attribs().items():
            print(f"  {k}: {v}")
            
inspect_leader_dxf('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

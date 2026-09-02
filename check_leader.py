import ezdxf

def check_leader_arrow_size(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    for leader in msp.query('LEADER')[:3]:
        print(f"Leader {leader.dxf.handle}:")
        if leader.dxf.hasattr('arrow_head_size'):
            print(f"  arrow_head_size: {leader.dxf.arrow_head_size}")
        else:
            print("  no arrow_head_size attribute")
        
        dimstyle = doc.dimstyles.get(leader.dxf.dimstyle)
        if dimstyle:
            print(f"  DIMASZ: {dimstyle.dxf.get('dimasz', 'N/A')}")
            print(f"  DIMSCALE: {dimstyle.dxf.get('dimscale', 'N/A')}")

check_leader_arrow_size('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

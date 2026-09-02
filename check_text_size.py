import ezdxf

def check_text_size(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    for leader in msp.query('LEADER')[:1]:
        print(f"Leader {leader.dxf.handle} Dimstyle: {leader.dxf.dimstyle}")
        dimstyle = doc.dimstyles.get(leader.dxf.dimstyle)
        if dimstyle:
            print(f"  DIMTXT (Text height): {dimstyle.dxf.get('dimtxt', 'N/A')}")
            print(f"  DIMASZ (Arrow size): {dimstyle.dxf.get('dimasz', 'N/A')}")
            print(f"  DIMSCALE: {dimstyle.dxf.get('dimscale', 'N/A')}")
            
check_text_size('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

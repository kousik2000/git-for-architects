import ezdxf

def check_leader_overrides(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    for leader in msp.query('LEADER')[:3]:
        print(f"Leader {leader.dxf.handle} Dimstyle: {leader.dxf.dimstyle}")
        # In ezdxf, dim style overrides can be accessed if they exist
        if hasattr(leader, 'dxf_overrides'):
            print("Overrides:")
            print(leader.dxf_overrides())
        
        # Let's print out all DXF attributes again, especially looking for scale
        print("DXF Attributes:")
        print(leader.dxf.all_existing_dxf_attribs())
        
        # also print extension dictionaries or xdata
        if leader.has_xdata('ACAD'):
            print("XDATA ACAD:", leader.get_xdata('ACAD'))
            
check_leader_overrides('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

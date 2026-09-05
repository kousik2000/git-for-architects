import ezdxf

def check_leader_details(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    leaders = list(msp.query('LEADER'))
    print(f"Total LEADERs: {len(leaders)}")
    
    has_arrow_head_size = 0
    dimasz_values = set()
    dimblks = set()
    
    for leader in leaders:
        if leader.dxf.hasattr('arrow_head_size'):
            has_arrow_head_size += 1
            dimasz_values.add(leader.dxf.arrow_head_size)
            
        dimstyle = doc.dimstyles.get(leader.dxf.dimstyle)
        if dimstyle:
            dimblks.add(dimstyle.dxf.get('dimblk', ''))
            
            dimasz = dimstyle.dxf.get('dimasz', doc.header.get('$DIMASZ', 2.5))
            if leader.has_xdata('ACAD'):
                xdata = leader.get_xdata('ACAD')
                i = 0
                while i < len(xdata):
                    tag = xdata[i]
                    if tag.code == 1070 and tag.value == 41:
                        if i + 1 < len(xdata) and xdata[i+1].code == 1040:
                            dimasz = xdata[i+1].value
                            break
                    i += 1
            dimasz_values.add(dimasz)

    print(f"Leaders with explicit arrow_head_size: {has_arrow_head_size}")
    print(f"Observed DIMASZ values (including overrides): {dimasz_values}")
    print(f"Observed DIMBLKs on leaders: {dimblks}")

check_leader_details('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

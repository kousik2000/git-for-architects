import ezdxf

def inspect_all_leaders(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    leaders = list(msp.query('LEADER'))
    print(f"Total LEADERS: {len(leaders)}")
    
    has_arrow_counts = {}
    for leader in leaders:
        has = leader.dxf.get('has_arrowhead', 'Missing')
        has_arrow_counts[has] = has_arrow_counts.get(has, 0) + 1
        
    print("has_arrowhead counts:", has_arrow_counts)

inspect_all_leaders('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

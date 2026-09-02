import ezdxf

def check_arrow_types(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    dim_blks = {}
    leader_blks = {}
    
    for e in msp:
        if e.dxftype() == 'DIMENSION':
            dimstyle = doc.dimstyles.get(e.dxf.dimstyle)
            blk = dimstyle.dxf.get('dimblk', 'Default ("")') if dimstyle else 'Unknown'
            dim_blks[blk] = dim_blks.get(blk, 0) + 1
        elif e.dxftype() in ('LEADER', 'MLEADER'):
            dimstyle = doc.dimstyles.get(e.dxf.dimstyle)
            blk = dimstyle.dxf.get('dimblk', 'Default ("")') if dimstyle else 'Unknown'
            leader_blks[blk] = leader_blks.get(blk, 0) + 1

    print("DIMENSION arrow types:", dim_blks)
    print("LEADER/MLEADER arrow types:", leader_blks)

check_arrow_types('e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf')

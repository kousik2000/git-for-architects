import sys
sys.path.append('arcos-cad/backend')
import ezdxf
import os
import json
from cad.parsers.dxf_parser import ArcosDxfParser

def test_lwpolyline_parser():
    doc = ezdxf.new('R2010')
    msp = doc.modelspace()
    
    # Create LWPOLYLINE
    # Points format: (x, y, start_width, end_width, bulge)
    # We can also just give (x, y, bulge) if format='xyb' but ezdxf api for creating:
    # msp.add_lwpolyline([(x, y, start_width, end_width, bulge), ...])
    # For bulge, 5th element.
    # Let's just use the add_lwpolyline with format
    points = [
        (0.0, 0.0, 0.0, 0.0, 0.0),      # straight
        (100.0, 0.0, 0.0, 0.0, 0.5),    # curved (bulge != 0)
        (100.0, 100.0, 0.0, 0.0, 0.0),  # straight
        (0.0, 100.0, 0.0, 0.0, 0.0)     # straight back to start (closed)
    ]
    msp.add_lwpolyline(points, close=True)
    
    # Save DXF
    test_dxf = 'test_lwpolyline.dxf'
    doc.saveas(test_dxf)
    
    # Parse
    parser = ArcosDxfParser(test_dxf)
    res = parser.parse()
    
    entities = res['entities']
    assert len(entities) == 1
    poly = entities[0]
    assert poly['type'] == 'LWPOLYLINE'
    assert poly['geometry']['closed'] is True
    
    vertices = poly['geometry']['vertices']
    assert len(vertices) == 4
    
    # vertices should be [x, y, z, bulge]
    assert vertices[0] == [0.0, 0.0, 0.0, 0.0]
    assert vertices[1] == [100.0, 0.0, 0.0, 0.5]
    assert vertices[2] == [100.0, 100.0, 0.0, 0.0]
    assert vertices[3] == [0.0, 100.0, 0.0, 0.0]
    
    print("LWPOLYLINE test passed!")
    print("Vertices extracted:")
    for v in vertices:
        print(f"  {v}")
    
    os.remove(test_dxf)

if __name__ == '__main__':
    test_lwpolyline_parser()

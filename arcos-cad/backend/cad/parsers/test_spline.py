import os
import sys
import ezdxf
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from cad.parsers.dxf_parser import ArcosDxfParser

def save_and_parse(doc, tmp_path, filename="test.dxf"):
    dxf_path = os.path.join(str(tmp_path), filename)
    doc.saveas(dxf_path)
    parser = ArcosDxfParser(dxf_path)
    return parser.parse()

def test_spline_schema_expanded(tmp_path):
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    
    # Create a spline with knots and weights
    fit_points = [(0, 0, 0), (10, 10, 0), (20, 0, 0)]
    spline = msp.add_spline(fit_points, degree=3)
    # ezdxf auto-generates knots/control points for fit points when saved.
    
    # We explicitly create one with knots to be sure.
    spline2 = msp.add_spline(degree=3)
    spline2.control_points = [(0, 0, 0), (10, 10, 0), (20, 0, 0), (30, -10, 0)]
    spline2.knots = [0, 0, 0, 0, 1, 1, 1, 1]
    spline2.weights = [1, 2, 1, 1]
    spline2.dxf.flags = 4
    
    res = save_and_parse(doc, tmp_path)
    splines = [e for e in res["entities"] if e["type"] == "SPLINE"]
    
    assert len(splines) == 2
    
    g2 = splines[1]["geometry"]
    assert "knots" in g2
    assert g2["knots"] == [0, 0, 0, 0, 1, 1, 1, 1]
    assert "weights" in g2
    assert g2["weights"] == [1, 2, 1, 1]
    assert g2["rational"] is True
    assert g2["periodic"] is False
    assert g2["degree"] == 3

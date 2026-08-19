import os
import tempfile
import pytest
import ezdxf

from cad.parsers.dxf_parser import ArcosDxfParser

def save_and_parse(doc, tmp_path):
    dxf_path = tmp_path / "test.dxf"
    doc.saveas(str(dxf_path))
    parser = ArcosDxfParser(str(dxf_path))
    return parser.parse()

def test_linetype_definitions(tmp_path):
    """Test that linetype definitions and patterns are correctly extracted."""
    doc = ezdxf.new("R2010")
    # Add a custom linetype
    doc.linetypes.new("CUSTOM_DASH", dxfattribs={
        "description": "Custom dashed line",
        "pattern": [2.0, 1.0, -1.0] # Total length, dash, gap
    })
    
    result = save_and_parse(doc, tmp_path)
    linetypes = result.get("linetypes", {})
    
    assert "CUSTOM_DASH" in linetypes
    assert linetypes["CUSTOM_DASH"]["pattern"] == [1.0, -1.0]

def test_global_ltscale(tmp_path):
    """Test that global $LTSCALE is extracted in units."""
    doc = ezdxf.new("R2010")
    doc.header["$LTSCALE"] = 2.5
    
    result = save_and_parse(doc, tmp_path)
    assert result["units"]["ltscale"] == 2.5

def test_entity_true_color_and_ltscale(tmp_path):
    """Test that true_color and entity ltscale are exported in style."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    
    line = msp.add_line((0, 0), (1, 1))
    line.dxf.true_color = 0xFF0000 # Red
    line.dxf.ltscale = 0.5
    
    result = save_and_parse(doc, tmp_path)
    entities = result["entities"]
    
    assert len(entities) == 1
    style = entities[0]["style"]
    
    assert style.get("trueColor") == 0xFF0000
    assert style.get("ltscale") == 0.5

def test_layer_true_color(tmp_path):
    """Test that true_color is exported for layers."""
    doc = ezdxf.new("R2010")
    layer = doc.layers.new("TrueColorLayer")
    layer.dxf.true_color = 0x00FF00 # Green
    
    result = save_and_parse(doc, tmp_path)
    layers = result["layers"]
    
    target_layer = next((l for l in layers if l["name"] == "TrueColorLayer"), None)
    assert target_layer is not None
    assert target_layer.get("trueColor") == 0x00FF00

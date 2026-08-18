"""
Phase 5.5 Automated Tests for ARCOS DXF Parser
===============================================

Tests cover:
  1. LINE geometry regression
  2. LWPOLYLINE bulge regression
  3. TEXT metadata (height, rotation, halign, valign)
  4. HATCH boundary extraction
  5. INSERT entity JSON structure
  6. Block definitions with entities
  7. INSERT -> block reference integrity
  8. Nested block INSERT reference preserved (not expanded)
  9. Entity count regression for canonical drawing

Run:
  cd e:\viewer_v2\arcos-cad\backend
  .venv\Scripts\python.exe -m pytest cad/parsers/tests_phase55.py -v
"""
import os
import sys
import json
import ezdxf
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from cad.parsers.dxf_parser import ArcosDxfParser

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_doc_with_lwpolyline():
    """Return an in-memory DXF document with one LWPOLYLINE with bulge."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    # (x, y, start_width, end_width, bulge)
    points = [
        (0.0, 0.0, 0.0, 0.0, 0.0),
        (100.0, 0.0, 0.0, 0.0, 0.5),
        (100.0, 100.0, 0.0, 0.0, 0.0),
        (0.0, 100.0, 0.0, 0.0, 0.0),
    ]
    msp.add_lwpolyline(points, close=True)
    return doc


def save_and_parse(doc, tmp_path, filename="test.dxf"):
    """Save doc to tmp_path, parse it, return result dict."""
    dxf_path = os.path.join(str(tmp_path), filename)
    doc.saveas(dxf_path)
    parser = ArcosDxfParser(dxf_path)
    return parser.parse()


# ---------------------------------------------------------------------------
# Test 1 -- LINE geometry regression
# ---------------------------------------------------------------------------

def test_line_geometry_unchanged(tmp_path):
    """LINE geometry must expose start and end as [x, y, z] arrays."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_line((1.0, 2.0, 3.0), (4.0, 5.0, 6.0))
    result = save_and_parse(doc, tmp_path)

    lines = [e for e in result["entities"] if e["type"] == "LINE"]
    assert len(lines) == 1, "Expected exactly 1 LINE entity"

    geo = lines[0]["geometry"]
    assert "start" in geo, "LINE must have geometry.start"
    assert "end" in geo, "LINE must have geometry.end"
    assert geo["start"] == [1.0, 2.0, 3.0], f"start mismatch: {geo['start']}"
    assert geo["end"] == [4.0, 5.0, 6.0], f"end mismatch: {geo['end']}"


# ---------------------------------------------------------------------------
# Test 2 -- LWPOLYLINE bulge regression
# ---------------------------------------------------------------------------

def test_lwpolyline_bulge_preserved(tmp_path):
    """LWPOLYLINE vertices must be [x, y, z, bulge]; bulge must survive serialization."""
    doc = make_doc_with_lwpolyline()
    result = save_and_parse(doc, tmp_path)

    polys = [e for e in result["entities"] if e["type"] == "LWPOLYLINE"]
    assert len(polys) == 1, "Expected exactly 1 LWPOLYLINE entity"

    geo = polys[0]["geometry"]
    assert geo["closed"] is True, "LWPOLYLINE must be closed"

    verts = geo["vertices"]
    assert len(verts) == 4, f"Expected 4 vertices, got {len(verts)}"

    # Vertex format: [x, y, z, bulge]
    assert verts[0] == [0.0, 0.0, 0.0, 0.0], f"vertex 0 mismatch: {verts[0]}"
    assert verts[1] == [100.0, 0.0, 0.0, 0.5], f"vertex 1 (bulge) mismatch: {verts[1]}"
    assert verts[2] == [100.0, 100.0, 0.0, 0.0], f"vertex 2 mismatch: {verts[2]}"
    assert verts[3] == [0.0, 100.0, 0.0, 0.0], f"vertex 3 mismatch: {verts[3]}"


# ---------------------------------------------------------------------------
# Test 3 -- TEXT metadata
# ---------------------------------------------------------------------------

def test_text_metadata_full(tmp_path):
    """TEXT entity must include height, rotation, halign, valign when set."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_text("Hello", dxfattribs={
        "insert": (10.0, 20.0, 0.0),
        "height": 2.5,
        "rotation": 45.0,
        "halign": 1,
        "valign": 2,
        "style": "Standard",
    })
    result = save_and_parse(doc, tmp_path)

    texts = [e for e in result["entities"] if e["type"] == "TEXT"]
    assert len(texts) == 1
    geo = texts[0]["geometry"]

    assert "location" in geo, "TEXT must have geometry.location"
    assert geo["location"] == [10.0, 20.0, 0.0], f"location mismatch: {geo['location']}"
    assert geo.get("height") == 2.5, f"height mismatch: {geo.get('height')}"
    assert geo.get("rotation") == 45.0, f"rotation mismatch: {geo.get('rotation')}"
    assert geo.get("halign") == 1, f"halign mismatch: {geo.get('halign')}"
    assert geo.get("valign") == 2, f"valign mismatch: {geo.get('valign')}"
    assert texts[0]["text"] == "Hello", f"text mismatch: {texts[0]['text']}"


def test_text_metadata_minimal(tmp_path):
    """TEXT with no rotation/alignment must NOT include those keys in geometry."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    msp.add_text("Plain", dxfattribs={
        "insert": (0.0, 0.0, 0.0),
        "height": 1.0,
    })
    result = save_and_parse(doc, tmp_path)

    texts = [e for e in result["entities"] if e["type"] == "TEXT"]
    assert len(texts) == 1
    geo = texts[0]["geometry"]

    assert "location" in geo
    assert "height" in geo
    # Absent attributes must NOT be included (not as None either)
    assert "rotation" not in geo, "rotation should not appear when not set"
    assert "halign" not in geo, "halign should not appear when not set"
    assert "valign" not in geo, "valign should not appear when not set"


# ---------------------------------------------------------------------------
# Test 4 -- HATCH boundary extraction
# ---------------------------------------------------------------------------

def test_hatch_boundary_paths(tmp_path):
    """HATCH must expose solidFill, patternName, and boundaryPaths."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    # Create a simple solid-fill HATCH with a triangular boundary
    hatch = msp.add_hatch(color=7)
    hatch.dxf.solid_fill = 1
    hatch.dxf.pattern_name = "SOLID"
    path = hatch.paths.add_edge_path()
    path.add_line((0, 0), (10, 0))
    path.add_line((10, 0), (5, 10))
    path.add_line((5, 10), (0, 0))

    result = save_and_parse(doc, tmp_path)

    hatches = [e for e in result["entities"] if e["type"] == "HATCH"]
    assert len(hatches) == 1
    geo = hatches[0]["geometry"]

    assert "solidFill" in geo, "HATCH must have geometry.solidFill"
    assert "patternName" in geo, "HATCH must have geometry.patternName"
    assert "boundaryPaths" in geo, "HATCH must have geometry.boundaryPaths"
    assert geo["solidFill"] is True
    assert geo["patternName"] == "SOLID"

    paths = geo["boundaryPaths"]
    assert len(paths) >= 1, "HATCH must have at least one boundary path"

    first_path = paths[0]
    assert first_path["type"] == "EdgePath", f"Expected EdgePath, got {first_path['type']}"
    assert "pathTypeFlags" in first_path, "EdgePath must have pathTypeFlags"
    assert "edges" in first_path, "EdgePath must have edges"

    edges = first_path["edges"]
    assert len(edges) == 3, f"Expected 3 edges, got {len(edges)}"

    # All edges must be LineEdge
    for edge in edges:
        assert edge["type"] == "LineEdge", f"Expected LineEdge, got {edge['type']}"
        assert "start" in edge, "LineEdge must have start"
        assert "end" in edge, "LineEdge must have end"
        assert len(edge["start"]) == 2, "LineEdge.start must be [x, y]"
        assert len(edge["end"]) == 2, "LineEdge.end must be [x, y]"


def test_hatch_no_solid_fill_keys(tmp_path):
    """The old solid_fill / pattern_name keys must NOT appear in Phase 5.5 output."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()
    hatch = msp.add_hatch()
    hatch.dxf.solid_fill = 1
    hatch.dxf.pattern_name = "SOLID"
    hatch.paths.add_edge_path()  # empty path is ok for schema test

    result = save_and_parse(doc, tmp_path)
    hatches = [e for e in result["entities"] if e["type"] == "HATCH"]
    if hatches:
        geo = hatches[0]["geometry"]
        assert "solid_fill" not in geo, "Old key solid_fill must not appear in Phase 5.5"
        assert "pattern_name" not in geo, "Old key pattern_name must not appear in Phase 5.5"


# ---------------------------------------------------------------------------
# Test 5 -- INSERT entity JSON structure
# ---------------------------------------------------------------------------

def test_insert_entity_structure(tmp_path):
    """INSERT entity must have blockName and geometry with insertionPoint/rotation/scale."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    block = doc.blocks.new("TEST_BLOCK")
    block.add_line((0, 0), (10, 0))

    msp.add_blockref("TEST_BLOCK", insert=(50.0, 60.0, 0.0), dxfattribs={
        "xscale": 2.0,
        "yscale": 3.0,
        "zscale": 1.0,
        "rotation": 90.0,
    })

    result = save_and_parse(doc, tmp_path)

    inserts = [e for e in result["entities"] if e["type"] == "INSERT"]
    assert len(inserts) == 1, f"Expected 1 INSERT, got {len(inserts)}"

    ins = inserts[0]
    assert ins["blockName"] == "TEST_BLOCK", f"blockName mismatch: {ins['blockName']}"

    geo = ins["geometry"]
    assert "insertionPoint" in geo
    assert "rotation" in geo
    assert "scale" in geo
    assert geo["insertionPoint"] == [50.0, 60.0, 0.0]
    assert geo["rotation"] == 90.0
    assert geo["scale"] == [2.0, 3.0, 1.0]


# ---------------------------------------------------------------------------
# Test 6 -- Block definitions with entities
# ---------------------------------------------------------------------------

def test_block_definitions_contain_entities(tmp_path):
    """blocks dict must contain only referenced blocks with their entities serialized."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    block = doc.blocks.new("MY_BLOCK")
    block.add_line((0, 0, 0), (10, 0, 0))
    block.add_circle((5, 5, 0), radius=2.0)

    # Unreferenced block -- must NOT appear in output
    unreferenced = doc.blocks.new("UNUSED_BLOCK")
    unreferenced.add_line((0, 0), (1, 1))

    msp.add_blockref("MY_BLOCK", insert=(0, 0, 0))

    result = save_and_parse(doc, tmp_path)

    blocks = result["blocks"]
    assert isinstance(blocks, dict), "blocks must be a dict in Phase 5.5"
    assert "MY_BLOCK" in blocks, "Referenced block must appear in blocks dict"
    assert "UNUSED_BLOCK" not in blocks, "Unreferenced block must NOT appear in blocks dict"

    block_def = blocks["MY_BLOCK"]
    assert "name" in block_def
    assert "basePoint" in block_def
    assert "entities" in block_def
    assert isinstance(block_def["entities"], list)

    # Both LINE and CIRCLE must be serialized inside the block
    block_types = {e["type"] for e in block_def["entities"]}
    assert "LINE" in block_types, "Block LINE entity must be serialized"
    assert "CIRCLE" in block_types, "Block CIRCLE entity must be serialized"

    # LINE geometry inside block must be correct
    block_lines = [e for e in block_def["entities"] if e["type"] == "LINE"]
    assert block_lines[0]["geometry"]["start"] == [0.0, 0.0, 0.0]
    assert block_lines[0]["geometry"]["end"] == [10.0, 0.0, 0.0]


# ---------------------------------------------------------------------------
# Test 7 -- INSERT -> block reference integrity
# ---------------------------------------------------------------------------

def test_insert_block_reference_integrity(tmp_path):
    """Every INSERT.blockName must resolve to an existing key in blocks dict."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    block_a = doc.blocks.new("BLOCK_A")
    block_a.add_line((0, 0), (5, 0))

    block_b = doc.blocks.new("BLOCK_B")
    block_b.add_circle((0, 0), 1.0)

    msp.add_blockref("BLOCK_A", insert=(0, 0, 0))
    msp.add_blockref("BLOCK_B", insert=(10, 0, 0))
    msp.add_blockref("BLOCK_A", insert=(20, 0, 0))  # second reference to BLOCK_A

    result = save_and_parse(doc, tmp_path)

    inserts = [e for e in result["entities"] if e["type"] == "INSERT"]
    assert len(inserts) == 3, f"Expected 3 INSERTs, got {len(inserts)}"

    blocks = result["blocks"]
    for ins in inserts:
        block_name = ins["blockName"]
        assert block_name in blocks, (
            f"INSERT references block '{block_name}' which is missing from blocks dict"
        )

    # Only 2 unique blocks (not 3 entries duplicated)
    assert len(blocks) == 2, f"Expected 2 unique block definitions, got {len(blocks)}"


# ---------------------------------------------------------------------------
# Test 8 -- Nested block INSERT preserved as reference
# ---------------------------------------------------------------------------

def test_nested_block_insert_preserved(tmp_path):
    """Nested INSERT inside a block must appear as an INSERT reference, not expanded."""
    doc = ezdxf.new("R2010")
    msp = doc.modelspace()

    inner = doc.blocks.new("INNER_BLOCK")
    inner.add_line((0, 0), (5, 0))

    outer = doc.blocks.new("OUTER_BLOCK")
    outer.add_line((0, 0), (10, 0))
    outer.add_blockref("INNER_BLOCK", insert=(2, 2, 0))  # nested INSERT

    msp.add_blockref("OUTER_BLOCK", insert=(0, 0, 0))

    result = save_and_parse(doc, tmp_path)
    blocks = result["blocks"]

    # Both OUTER_BLOCK and INNER_BLOCK must be in blocks (transitively needed)
    assert "OUTER_BLOCK" in blocks, "OUTER_BLOCK must be in blocks dict"
    assert "INNER_BLOCK" in blocks, "INNER_BLOCK must be in blocks dict (transitively needed)"

    # OUTER_BLOCK must contain a nested INSERT reference (not expanded geometry)
    outer_entities = blocks["OUTER_BLOCK"]["entities"]
    nested_inserts = [e for e in outer_entities if e["type"] == "INSERT"]
    assert len(nested_inserts) == 1, "Nested INSERT must appear as INSERT reference in block entities"
    assert nested_inserts[0]["blockName"] == "INNER_BLOCK", (
        f"Nested INSERT blockName mismatch: {nested_inserts[0]['blockName']}"
    )

    # INNER_BLOCK entities must appear in the blocks dict, not inlined into OUTER_BLOCK
    inner_entities = blocks["INNER_BLOCK"]["entities"]
    inner_lines = [e for e in inner_entities if e["type"] == "LINE"]
    assert len(inner_lines) == 1, "INNER_BLOCK must contain its own LINE entity"


# ---------------------------------------------------------------------------
# Test 9 -- Entity count regression (canonical parsed_cad.json)
# ---------------------------------------------------------------------------

def test_entity_count_regression_from_parsed_json():
    """
    Verify entity type counts from the canonical parsed_cad.json match expected values.
    This tests the PARSER OUTPUT directly without running Docker/LibreDWG.
    The reference file is the parsed_cad.json already generated from the canonical DWG.
    """
    json_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "..", "..", "parsed_cad.json"
    )
    json_path = os.path.normpath(json_path)

    if not os.path.exists(json_path):
        pytest.skip(f"Canonical parsed_cad.json not found at {json_path}")

    with open(json_path, "r") as f:
        data = json.load(f)

    stats = data["data"]["statistics"]
    entity_types = stats["entityTypes"]

    # Core entity type counts -- these must not change
    assert entity_types.get("LINE", 0) == 54, f"LINE count mismatch: {entity_types.get('LINE', 0)}"
    assert entity_types.get("LWPOLYLINE", 0) == 68, f"LWPOLYLINE count mismatch: {entity_types.get('LWPOLYLINE', 0)}"
    assert entity_types.get("TEXT", 0) == 11, f"TEXT count mismatch: {entity_types.get('TEXT', 0)}"
    assert entity_types.get("HATCH", 0) == 17, f"HATCH count mismatch: {entity_types.get('HATCH', 0)}"
    assert entity_types.get("INSERT", 0) == 15, f"INSERT count mismatch: {entity_types.get('INSERT', 0)}"

    # Filtered entities (unsupported) -- must stay at 19
    assert entity_types.get("IMAGE", 0) == 16, f"IMAGE count mismatch: {entity_types.get('IMAGE', 0)}"
    assert entity_types.get("OLE2FRAME", 0) == 3, f"OLE2FRAME count mismatch: {entity_types.get('OLE2FRAME', 0)}"

    # Total must be 184
    assert stats["totalEntities"] == 184, f"totalEntities mismatch: {stats['totalEntities']}"

    # Serialized entities = 165
    assert stats["supportedEntities"] == 165, f"supportedEntities mismatch: {stats['supportedEntities']}"

    # Filtered = 19 (IMAGE + OLE2FRAME)
    assert stats["unsupportedEntities"] == 19, f"unsupportedEntities mismatch: {stats['unsupportedEntities']}"

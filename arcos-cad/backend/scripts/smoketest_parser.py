import sys, json
sys.path.insert(0, "arcos-cad/backend")
from cad.parsers.dxf_parser import ArcosDxfParser

print("=== Smoke test: F2841747.dxf (HATCH-heavy) ===")
parser = ArcosDxfParser("dxf_files/F2841747.dxf")
result = parser.parse()

stats = result["statistics"]
print(f"totalEntities:     {stats['totalEntities']}")
print(f"supportedEntities: {stats['supportedEntities']}")
print(f"unsupportedEntities: {stats['unsupportedEntities']}")
print(f"entityTypes:       {stats['entityTypes']}")
print(f"blocks count:      {stats['blocks']}")
print(f"blocks type:       {type(result['blocks']).__name__}")

# Check HATCHes
hatches = [e for e in result["entities"] if e["type"] == "HATCH"]
print(f"\nHATCH entities: {len(hatches)}")
if hatches:
    h = hatches[0]
    geo = h["geometry"]
    print(f"  solidFill:    {geo['solidFill']}")
    print(f"  patternName:  {geo['patternName']}")
    print(f"  boundaryPaths count: {len(geo['boundaryPaths'])}")
    if geo["boundaryPaths"]:
        path = geo["boundaryPaths"][0]
        print(f"  first path type: {path['type']}")
        print(f"  first path pathTypeFlags: {path['pathTypeFlags']}")
        if "edges" in path and path["edges"]:
            edge = path["edges"][0]
            print(f"  first edge type: {edge['type']}")
            print(f"  first edge start: {edge['start']}")
            print(f"  first edge end:   {edge['end']}")

# Check LINE geometry unchanged
lines = [e for e in result["entities"] if e["type"] == "LINE"]
print(f"\nLINE entities: {len(lines)}")
if lines:
    l = lines[0]
    print(f"  start: {l['geometry']['start']}")
    print(f"  end:   {l['geometry']['end']}")

# Check LWPOLYLINE vertices unchanged
lwpolys = [e for e in result["entities"] if e["type"] == "LWPOLYLINE"]
print(f"\nLWPOLYLINE entities: {len(lwpolys)}")
if lwpolys:
    lw = lwpolys[0]
    print(f"  vertices count: {len(lw['geometry']['vertices'])}")
    if lw["geometry"]["vertices"]:
        print(f"  first vertex format: {lw['geometry']['vertices'][0]}")

print(f"\nWarnings: {len(result['warnings'])}")
if result["warnings"]:
    for w in result["warnings"][:3]:
        print(f"  {w}")

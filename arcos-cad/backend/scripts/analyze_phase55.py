import json, os

# Before stats
before_path = "../../frontend/src/dummy-json/parsed_cad.json"
after_path = "parsed_cad_phase5_5.json"
before_size = os.path.getsize(before_path)
after_size = os.path.getsize(after_path)
print(f"JSON size BEFORE Phase 5.5: {before_size:,} bytes ({before_size/1024/1024:.2f} MB)")
print(f"JSON size AFTER  Phase 5.5: {after_size:,} bytes ({after_size/1024/1024:.2f} MB)")
print(f"Size increase: {after_size - before_size:,} bytes ({(after_size-before_size)/1024/1024:.2f} MB)")
print()

data = json.load(open(after_path))
d = data["data"]

# Statistics
stats = d["statistics"]
print("=== Statistics ===")
print(f"totalEntities:       {stats['totalEntities']}")
print(f"supportedEntities:   {stats['supportedEntities']}")
print(f"unsupportedEntities: {stats['unsupportedEntities']}")
print(f"layers:              {stats['layers']}")
print(f"blocks:              {stats['blocks']}")
print(f"parsingTimeMs:       {stats['parsingTimeMs']}")
print(f"entityTypes:         {stats['entityTypes']}")
print()

# Blocks
blocks = d["blocks"]
print("=== Blocks ===")
print(f"blocks type:         {type(blocks).__name__}")
print(f"blocks count:        {len(blocks)}")
total_block_ents = 0
block_entity_type_dist = {}
for name, block in blocks.items():
    ents = block["entities"]
    total_block_ents += len(ents)
    for e in ents:
        t = e["type"]
        block_entity_type_dist[t] = block_entity_type_dist.get(t, 0) + 1
print(f"Total block entities: {total_block_ents}")
print(f"Block entity types: {block_entity_type_dist}")
print()

# Entities analysis
entities = d["entities"]
print("=== MSP Entities ===")
print(f"Total entities[]: {len(entities)}")

lines = [e for e in entities if e["type"] == "LINE"]
lwpolys = [e for e in entities if e["type"] == "LWPOLYLINE"]
texts = [e for e in entities if e["type"] == "TEXT"]
hatches = [e for e in entities if e["type"] == "HATCH"]
inserts = [e for e in entities if e["type"] == "INSERT"]

print(f"LINE:       {len(lines)}")
print(f"LWPOLYLINE: {len(lwpolys)}")
print(f"TEXT:       {len(texts)}")
print(f"HATCH:      {len(hatches)}")
print(f"INSERT:     {len(inserts)}")
print()

# LINE geometry verification
print("=== LINE geometry check ===")
line = lines[0]
print(f"First LINE start: {line['geometry']['start']}")
print(f"First LINE end:   {line['geometry']['end']}")
assert "start" in line["geometry"] and "end" in line["geometry"]
print("OK")
print()

# LWPOLYLINE vertex format check
print("=== LWPOLYLINE vertex format ===")
lw = lwpolys[0]
v = lw["geometry"]["vertices"][0]
print(f"First vertex: {v}")
assert len(v) == 4, f"Expected [x, y, z, bulge], got {v}"
print(f"closed: {lw['geometry']['closed']}")
print("OK")
print()

# TEXT metadata check
print("=== TEXT metadata ===")
for t in texts:
    geo = t["geometry"]
    has_height = "height" in geo
    has_rotation = "rotation" in geo
    has_halign = "halign" in geo
    has_valign = "valign" in geo
    print(f"  id={t['id']} text={t['text']!r:20s} height={'Y' if has_height else 'N'} rotation={'Y' if has_rotation else 'N'} halign={'Y' if has_halign else 'N'} valign={'Y' if has_valign else 'N'}")
    if has_height:
        print(f"    height={geo['height']}, location={geo['location']}")
print()

# HATCH boundary check
print("=== HATCH boundary paths ===")
hatch_path_types = {}
hatch_edge_types = {}
total_paths = 0
total_edges = 0
hatch_with_multi_paths = 0

for h in hatches:
    geo = h["geometry"]
    assert "solidFill" in geo, "solidFill missing"
    assert "patternName" in geo, "patternName missing"
    assert "boundaryPaths" in geo, "boundaryPaths missing"
    # Old keys must be gone
    assert "solid_fill" not in geo, "solid_fill must not exist in Phase 5.5"
    assert "pattern_name" not in geo, "pattern_name must not exist in Phase 5.5"
    
    paths = geo["boundaryPaths"]
    total_paths += len(paths)
    if len(paths) > 1:
        hatch_with_multi_paths += 1
    for path in paths:
        pt = path["type"]
        hatch_path_types[pt] = hatch_path_types.get(pt, 0) + 1
        if "edges" in path:
            for edge in path["edges"]:
                et = edge["type"]
                hatch_edge_types[et] = hatch_edge_types.get(et, 0) + 1
                total_edges += 1

print(f"HATCH entities:         {len(hatches)}")
print(f"Total boundary paths:   {total_paths}")
print(f"HATCHes with >1 path:   {hatch_with_multi_paths}")
print(f"Total edges:            {total_edges}")
print(f"Path type distribution: {hatch_path_types}")
print(f"Edge type distribution: {hatch_edge_types}")

# Sample hatch
h = hatches[0]
geo = h["geometry"]
print(f"\nFirst HATCH sample:")
print(f"  solidFill:   {geo['solidFill']}")
print(f"  patternName: {geo['patternName']}")
print(f"  paths count: {len(geo['boundaryPaths'])}")
if geo['boundaryPaths']:
    path = geo['boundaryPaths'][0]
    print(f"  first path type: {path['type']}")
    print(f"  pathTypeFlags:   {path['pathTypeFlags']}")
    if "edges" in path and path["edges"]:
        edge = path["edges"][0]
        print(f"  first edge: type={edge['type']} start={edge['start']} end={edge['end']}")
print()

# INSERT -> block reference integrity
print("=== INSERT -> block reference integrity ===")
missing = []
for ins in inserts:
    bn = ins["blockName"]
    if bn not in blocks:
        missing.append(bn)
print(f"INSERT count:   {len(inserts)}")
unique_blocks = set(ins["blockName"] for ins in inserts)
print(f"Unique blocks referenced: {len(unique_blocks)}")
print(f"Block definitions: {len(blocks)}")
print(f"Missing block refs: {missing}")
if not missing:
    print("OK -- All INSERT.blockName resolve to block definitions")
print()

# Verify block entities
print("=== Block entity details ===")
for name, block in blocks.items():
    ents = block["entities"]
    types = {}
    for e in ents:
        types[e["type"]] = types.get(e["type"], 0) + 1
    nested_inserts = [e for e in ents if e["type"] == "INSERT"]
    print(f"  {name!r}: {len(ents)} entities, types={types}", end="")
    if nested_inserts:
        for ni in nested_inserts:
            print(f" [NESTED INSERT -> {ni['blockName']!r}]", end="")
    print()
print()

print("=== Warnings ===")
warnings = d.get("warnings", [])
warn_types = {}
for w in warnings:
    warn_types[w["code"]] = warn_types.get(w["code"], 0) + 1
print(f"Total warnings: {len(warnings)}")
print(f"Warning types: {warn_types}")

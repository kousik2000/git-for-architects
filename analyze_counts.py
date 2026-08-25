import ezdxf
import json
import collections

dxf_file = r'e:\viewer_v2\F2841747_converter_test.dxf'
json_file = r'e:\viewer_v2\arcos-cad\frontend\src\dummy-json\cad.json'

doc = ezdxf.readfile(dxf_file)

# Count DXF entities
dxf_counts = collections.Counter()
ms = doc.modelspace()
for e in ms:
    dxf_counts[e.dxftype()] += 1

block_counts = collections.Counter()
for block in doc.blocks:
    if getattr(block, 'is_layout', False) and block.name != '*Model_Space':
        continue
    for e in block:
        dxf_counts[e.dxftype()] += 1
        block_counts[e.dxftype()] += 1

print("--- DXF COUNTS ---")
for k, v in dxf_counts.most_common():
    print(f"{k}: {v}")

print("\n--- DXF BLOCK COUNTS ---")
for k, v in block_counts.most_common():
    print(f"{k}: {v}")

# Count JSON entities
try:
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f).get('data', {})
        
    json_counts = collections.Counter()
    for e in data.get('entities', []):
        json_counts[e.get('type')] += 1
        
    for block in data.get('blocks', {}).values():
        for e in block.get('entities', []):
            json_counts[e.get('type')] += 1

    print("\n--- JSON COUNTS ---")
    for k, v in json_counts.most_common():
        print(f"{k}: {v}")
except Exception as e:
    print("Could not load JSON:", e)

# Let's inspect missing LINEs specifically
ms_lines = [e for e in ms if e.dxftype() == 'LINE']
print("\nModelspace LINE count in DXF:", len(ms_lines))
json_ms_lines = [e for e in data.get('entities', []) if e.get('type') == 'LINE']
print("Modelspace LINE count in JSON:", len(json_ms_lines))

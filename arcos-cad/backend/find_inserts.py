import json
with open('E:/viewer_v2/arcos-cad/backend/canonical_forensic.json', 'r') as f:
    jdoc = json.load(f)

block_names = ['500', 'LAY', 'ererer', 'vbvbv']

def find_inserts(entities, loc):
    for e in entities:
        if e.get('type') == 'INSERT':
            bname = e.get('blockName')
            if bname in block_names:
                print(f"Found INSERT for {bname} in {loc}: scale={e.get('geometry', {}).get('scale')}")

find_inserts(jdoc.get('entities', []), 'Modelspace')
for layout_name, layout_data in jdoc.get('layouts', {}).items():
    find_inserts(layout_data.get('entities', []), f'Layout {layout_name}')
for block_name, block_data in jdoc.get('blocks', {}).items():
    find_inserts(block_data.get('entities', []), f'Block {block_name}')

import json
json_file = 'E:/viewer_v2/arcos-cad/backend/canonical_forensic.json'
with open(json_file, 'r') as f:
    jdoc = json.load(f)

search_terms = ['SCALE', 'NORTH', 'SIGNATURE', 'NAME', 'DATE', 'R.V.KOUSIK']
def search_json(entities, loc_name):
    for e in entities:
        if e.get('type') in ['TEXT', 'MTEXT']:
            text = e.get('text', '').upper()
            if any(t in text for t in search_terms):
                print(f'Match in JSON {loc_name}: type={e.get("type")} text="{text}" layer={e.get("layer")}')
        if e.get('type') in ['DIMENSION', 'LEADER', 'MLEADER', 'ARC_DIMENSION']:
            for v in e.get('geometry', {}).get('virtualEntities', []):
                if v.get('type') in ['TEXT', 'MTEXT']:
                    text = v.get('text', '').upper()
                    if any(t in text for t in search_terms):
                        print(f'Match in JSON VIRTUAL {loc_name}: type={v.get("type")} text="{text}" layer={v.get("layer")}')
                        
search_json(jdoc.get('entities', []), 'Modelspace')
for layout_name, layout_data in jdoc.get('layouts', {}).items():
    search_json(layout_data.get('entities', []), f'Layout {layout_name}')
for block_name, block_data in jdoc.get('blocks', {}).items():
    search_json(block_data.get('entities', []), f'Block {block_name}')

import json
with open('E:/viewer_v2/arcos-cad/backend/canonical_forensic.json', 'r') as f:
    jdoc = json.load(f)

for layout_name, l in jdoc.get('layouts', {}).items():
    for e in l.get('entities', []):
        if e.get('type') == 'MTEXT':
            text = e.get('text', '')
            if 'SCALE' in text.upper() or 'NORTH' in text.upper():
                print(f'Found in Layout {layout_name}: {e.get("id")} text="{text}" height={e.get("geometry", {}).get("height")}')
                
    for e in l.get('entities', []):
        if e.get('type') == 'INSERT':
            bname = e.get('blockName')
            print(f'Found INSERT for {bname} in Layout {layout_name}: scale={e.get("geometry", {}).get("scale")}')

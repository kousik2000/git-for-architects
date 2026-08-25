import json
with open('E:/viewer_v2/arcos-cad/backend/canonical_forensic.json', 'r') as f:
    jdoc = json.load(f)

for block_name, b in jdoc.get('blocks', {}).items():
    for e in b.get('entities', []):
        if e.get('type') == 'MTEXT':
            text = e.get('text', '')
            if 'SCALE' in text.upper() or 'NORTH' in text.upper():
                print(f'Found in Block {block_name}: {e.get("id")} text="{text}" height={e.get("geometry", {}).get("height")}')

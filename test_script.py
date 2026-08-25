
import sys
sys.path.append('E:/viewer_v2/arcos-cad/backend/cad/parsers')
from dxf_parser import ArcosDxfParser
import json

parser = ArcosDxfParser('E:/viewer_v2/dxf_files/F2841747.dxf')
data = parser.parse()

layouts = data['layouts']
print('Layouts found:', list(layouts.keys()))
for lname, ldata in layouts.items():
    print('Layout', lname, 'has', len(ldata['entities']), 'entities')

blocks = data['blocks']
mtext_count = sum(1 for b in blocks.values() for e in b.get('entities', []) if e.get('type') == 'MTEXT')
print('MTEXT in blocks:', mtext_count)

found_scale = False
for b in blocks.values():
    for e in b.get('entities', []):
        if e.get('type') in ('MTEXT', 'TEXT'):
            if 'SCALE' in e.get('text', '').upper():
                found_scale = True
                print('Found SCALE in block', b['name'])

print('SCALE: NORTH found:', found_scale)


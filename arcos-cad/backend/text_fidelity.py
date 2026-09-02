import ezdxf
import json
import math

dxf_file = 'E:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf'
json_file = 'E:/viewer_v2/arcos-cad/backend/canonical_forensic.json'

doc = ezdxf.readfile(dxf_file)
with open(json_file, 'r') as f:
    jdoc = json.load(f)

# Collect all JSON entities by ID
json_entities = {}
for e in jdoc.get('entities', []):
    json_entities[e.get('id')] = e
for l in jdoc.get('layouts', {}).values():
    for e in l.get('entities', []):
        json_entities[e.get('id')] = e
for b in jdoc.get('blocks', {}).values():
    for e in b.get('entities', []):
        json_entities[e.get('id')] = e

handles_to_check = ['28C64', '11D57', '11D59', '18D5B', '17D57', '1CFF7']

def print_dxf_text(entity):
    print(f'DXF Handle: {entity.dxf.handle}')
    print(f'  Type: {entity.dxftype()}')
    print(f'  Layer: {entity.dxf.layer}')
    print(f'  Text: {entity.dxf.text}')
    if hasattr(entity, 'plain_text'):
        print(f'  Plain Text: {entity.plain_text()}')
    print(f'  Insert/Location: {entity.dxf.insert if entity.dxf.hasattr("insert") else None}')
    print(f'  Align pt: {entity.dxf.align_point if entity.dxf.hasattr("align_point") else None}')
    print(f'  Height: {entity.dxf.char_height if entity.dxf.hasattr("char_height") else (entity.dxf.height if entity.dxf.hasattr("height") else None)}')
    print(f'  Rotation: {entity.dxf.rotation if entity.dxf.hasattr("rotation") else (entity.dxf.text_direction if entity.dxf.hasattr("text_direction") else None)}')
    print(f'  H-align/V-align: {entity.dxf.halign if entity.dxf.hasattr("halign") else None} / {entity.dxf.valign if entity.dxf.hasattr("valign") else None}')
    print(f'  Attachment pt: {entity.dxf.attachment_point if entity.dxf.hasattr("attachment_point") else None}')
    print(f'  Width: {entity.dxf.width if entity.dxf.hasattr("width") else None}')
    print(f'  Line spacing: {entity.dxf.line_spacing_factor if entity.dxf.hasattr("line_spacing_factor") else None}')
    print(f'  Flow direction: {entity.dxf.flow_direction if entity.dxf.hasattr("flow_direction") else None}')
    
def print_json_text(handle):
    je = json_entities.get(handle)
    if not je:
        print(f'JSON Handle: {handle} NOT FOUND')
        return
    print(f'JSON Handle: {je.get("id")}')
    print(f'  Type: {je.get("type")}')
    print(f'  Text: {je.get("text")}')
    geom = je.get('geometry', {})
    print(f'  Location: {geom.get("location")}')
    print(f'  Height: {geom.get("height")}')
    print(f'  Rotation: {geom.get("rotation")}')
    print(f'  H-align/V-align: {geom.get("halign")} / {geom.get("valign")}')
    print(f'  Attachment pt: {geom.get("attachment_point")}')
    print(f'  Width: {geom.get("width")}')

def search_dxf(space):
    for e in space:
        if e.dxf.handle in handles_to_check:
            print('-' * 40)
            print_dxf_text(e)
            print_json_text(e.dxf.handle)

search_dxf(doc.modelspace())
for layout in doc.layouts:
    if layout.name != 'Model':
        search_dxf(layout)
for b in doc.blocks:
    if b.name.startswith('*Model_Space') or b.name.startswith('*Paper_Space'): continue
    search_dxf(b)

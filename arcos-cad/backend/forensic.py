import ezdxf
import json
import os
import sys

dxf_file = 'E:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf'
json_file = 'E:/viewer_v2/arcos-cad/backend/canonical_forensic.json'

doc = ezdxf.readfile(dxf_file)
with open(json_file, 'r') as f:
    jdoc = json.load(f)

print('--- 1. PARSE EXACT DXF ---')
dxf_types = {}
def count_dxf(space):
    for e in space:
        t = e.dxftype()
        dxf_types[t] = dxf_types.get(t, 0) + 1
        
        # Virtual entities
        if t in ['DIMENSION', 'LEADER', 'MLEADER', 'ARC_DIMENSION']:
            try:
                for v in e.virtual_entities():
                    vt = v.dxftype()
                    dxf_types[f"{t}_V_{vt}"] = dxf_types.get(f"{t}_V_{vt}", 0) + 1
            except:
                pass

count_dxf(doc.modelspace())
msp_count = sum([v for k,v in dxf_types.items() if '_V_' not in k])

layout_counts = {}
for layout in doc.layouts:
    if layout.name != 'Model':
        l_cnt = 0
        for e in layout:
            t = e.dxftype()
            dxf_types[t] = dxf_types.get(t, 0) + 1
            l_cnt += 1
            if t in ['DIMENSION', 'LEADER', 'MLEADER', 'ARC_DIMENSION']:
                try:
                    for v in e.virtual_entities():
                        vt = v.dxftype()
                        dxf_types[f"{t}_V_{vt}"] = dxf_types.get(f"{t}_V_{vt}", 0) + 1
                except:
                    pass
        layout_counts[layout.name] = l_cnt

block_counts = 0
for b in doc.blocks:
    if b.name.startswith('*Model_Space') or b.name.startswith('*Paper_Space'): continue
    for e in b:
        t = e.dxftype()
        dxf_types[t] = dxf_types.get(t, 0) + 1
        block_counts += 1
        if t in ['DIMENSION', 'LEADER', 'MLEADER', 'ARC_DIMENSION']:
            try:
                for v in e.virtual_entities():
                    vt = v.dxftype()
                    dxf_types[f"{t}_V_{vt}"] = dxf_types.get(f"{t}_V_{vt}", 0) + 1
            except:
                pass

print('DXF Types:', dxf_types)
print('DXF Modelspace:', msp_count)
print('DXF Layouts:', sum(layout_counts.values()))
print('DXF Blocks entities:', block_counts)

print('JSON Stats:', jdoc.get('statistics'))
print('JSON model entities:', len(jdoc.get('entities', [])))
print('JSON layout entities:', sum(len(l.get('entities', [])) for l in jdoc.get('layouts', {}).values()))
print('JSON blocks:', len(jdoc.get('blocks', {})))

print('\n--- 2. SEARCH FOR MISSING TEXT ---')
search_terms = ['SCALE', 'NORTH', 'SIGNATURE', 'NAME', 'DATE', 'R.V.KOUSIK']
def search_text(space, loc_name):
    for e in space:
        text = ''
        if e.dxftype() in ['TEXT', 'MTEXT']:
            text = e.dxf.text
        if any(t in text.upper() for t in search_terms):
            print(f'Match in {loc_name}: {e.dxftype()} handle={e.dxf.handle} text="{text}" layer={e.dxf.layer}')
        
        # also search within dimensions
        if e.dxftype() in ['DIMENSION', 'LEADER', 'MLEADER', 'ARC_DIMENSION']:
            try:
                for v in e.virtual_entities():
                    text2 = ''
                    if v.dxftype() in ['TEXT', 'MTEXT']:
                        text2 = v.dxf.text
                    if any(t in text2.upper() for t in search_terms):
                        print(f'Match in VIRTUAL {loc_name}: {v.dxftype()} handle={e.dxf.handle} (parent) text="{text2}" layer={e.dxf.layer}')
            except:
                pass

search_text(doc.modelspace(), 'Modelspace')
for layout in doc.layouts:
    if layout.name != 'Model':
        search_text(layout, f'Layout {layout.name}')
for b in doc.blocks:
    if b.name.startswith('*Model_Space') or b.name.startswith('*Paper_Space'): continue
    search_text(b, f'Block {b.name}')

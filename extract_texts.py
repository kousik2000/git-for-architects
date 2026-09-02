import ezdxf
import json
import math

def analyze_dxf(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    texts = []
    
    # Let's find 10 interesting ones
    # 1. TEXT on Layer 0
    for e in msp.query('TEXT[layer=="0"]'):
        texts.append(e)
        break
    
    # 2. MTEXT on Layer 0
    for e in msp.query('MTEXT[layer=="0"]'):
        texts.append(e)
        break
        
    # 3. MTEXT on PDF_Text
    for e in msp.query('MTEXT[layer=="PDF_Text"]'):
        texts.append(e)
        break
        
    # 4. rotated text
    for e in msp.query('TEXT'):
        if hasattr(e.dxf, 'rotation') and e.dxf.rotation != 0:
            texts.append(e)
            break
            
    # 5. horizontally aligned text
    for e in msp.query('TEXT'):
        if hasattr(e.dxf, 'halign') and e.dxf.halign != 0:
            texts.append(e)
            break
            
    # 6. vertically aligned text
    for e in msp.query('TEXT'):
        if hasattr(e.dxf, 'valign') and e.dxf.valign != 0:
            texts.append(e)
            break
            
    # 7. multiline MTEXT
    for e in msp.query('MTEXT'):
        if '\n' in e.text or '\\P' in e.text:
            texts.append(e)
            break
            
    # 8. text with different heights
    for e in msp.query('TEXT'):
        if hasattr(e.dxf, 'height') and e.dxf.height > 2:
            texts.append(e)
            break
            
    # 9. text inside a block
    block_texts = []
    for block in doc.blocks:
        if block.name.startswith('*'): continue
        if block.name.startswith('Paper_'): continue
        
        has_insert = False
        inst_handle = None
        for inst in msp.query(f'INSERT[name=="{block.name}"]'):
            has_insert = True
            inst_handle = inst
            break
            
        if has_insert:
            for e in block.query('TEXT MTEXT'):
                block_texts.append((block, e, inst_handle))
                break
        if len(block_texts) > 2:
            break
            
    for e in texts:
        print("Entity:", e.dxftype())
        print("Handle:", e.dxf.handle)
        print("Text:", getattr(e, 'text', '') or getattr(e.dxf, 'text', ''))
        print("Layer:", e.dxf.layer)
        print("Height:", e.dxf.height if hasattr(e.dxf, 'height') else getattr(e.dxf, 'char_height', 'N/A'))
        print("Rotation:", e.dxf.rotation if hasattr(e.dxf, 'rotation') else 'N/A')
        print("Insert:", e.dxf.insert)
        if e.dxftype() == 'TEXT':
            print("Halign:", getattr(e.dxf, 'halign', 0))
            print("Valign:", getattr(e.dxf, 'valign', 0))
            print("Align point:", getattr(e.dxf, 'align_point', (0,0,0)))
        elif e.dxftype() == 'MTEXT':
            print("Attachment point:", getattr(e.dxf, 'attachment_point', 1))
            print("Text direction:", getattr(e.dxf, 'text_direction', (1,0,0)))
        print("-" * 40)
        
    for b, e, inst in block_texts:
        print("BLOCK TEXT:")
        print("Block name:", b.name)
        print("Block base:", b.block.dxf.base_point)
        print("Entity:", e.dxftype())
        print("Handle:", e.dxf.handle)
        print("Text:", getattr(e, 'text', '') or getattr(e.dxf, 'text', ''))
        print("Layer:", e.dxf.layer)
        print("Height:", e.dxf.height if hasattr(e.dxf, 'height') else getattr(e.dxf, 'char_height', 'N/A'))
        print("Insert:", e.dxf.insert)
        print("Insert handle:", inst.dxf.handle)
        print("Insert pos:", inst.dxf.insert)
        print("Insert scale:", inst.dxf.xscale, getattr(inst.dxf, 'yscale', inst.dxf.xscale))
        print("Insert rot:", inst.dxf.rotation)
        print("-" * 40)
            
analyze_dxf("e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf")

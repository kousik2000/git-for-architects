import ezdxf

def investigate_rotation_texts(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    search_texts = [
        "TOWARDS RAILWAY",
        "BANDAR ROAD",
        "KALESWARA FLYOVER",
        "POLICE CONTROL ROOM"
    ]
    
    for entity in doc.entities:
        text = getattr(entity, 'text', '') or getattr(entity.dxf, 'text', '')
        if entity.dxftype() == 'MTEXT':
            text = entity.text
            
        for st in search_texts:
            if st in text.upper():
                print("=======================================")
                print(f"Match: {st}")
                print(f"Handle: {entity.dxf.handle}")
                print(f"Type: {entity.dxftype()}")
                print(f"Text (raw): {repr(text)}")
                if entity.dxftype() == 'MTEXT':
                    print(f"Text (plain): {repr(entity.plain_text())}")
                print(f"Layer: {entity.dxf.layer}")
                
                if entity.dxftype() == 'TEXT':
                    print(f"Insert: {entity.dxf.insert}")
                    print(f"Align Point: {getattr(entity.dxf, 'align_point', 'N/A')}")
                    print(f"Halign: {getattr(entity.dxf, 'halign', 0)}")
                    print(f"Valign: {getattr(entity.dxf, 'valign', 0)}")
                    print(f"Rotation: {getattr(entity.dxf, 'rotation', 0)}")
                elif entity.dxftype() == 'MTEXT':
                    print(f"Insert: {entity.dxf.insert}")
                    print(f"Attachment point: {getattr(entity.dxf, 'attachment_point', 1)}")
                    print(f"Rotation: {getattr(entity.dxf, 'rotation', 0)}")
                    print(f"Text direction: {getattr(entity.dxf, 'text_direction', (1,0,0))}")

    # Also check blocks
    for block in doc.blocks:
        if block.name.startswith('*'): continue
        for entity in block:
            if entity.dxftype() not in ['TEXT', 'MTEXT']: continue
            text = getattr(entity, 'text', '') or getattr(entity.dxf, 'text', '')
            if entity.dxftype() == 'MTEXT':
                text = entity.text
            for st in search_texts:
                if st in text.upper():
                    print("=======================================")
                    print(f"Match: {st} (IN BLOCK {block.name})")
                    print(f"Handle: {entity.dxf.handle}")
                    print(f"Type: {entity.dxftype()}")
                    print(f"Text (raw): {repr(text)}")
                    print(f"Rotation: {getattr(entity.dxf, 'rotation', 0)}")
                    print(f"Text direction: {getattr(entity.dxf, 'text_direction', (1,0,0))}")

investigate_rotation_texts("e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf")

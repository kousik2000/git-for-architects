import ezdxf

def find_texts(filepath):
    doc = ezdxf.readfile(filepath)
    msp = doc.modelspace()
    
    search_texts = [
        "SCALE",
        "NORTH",
        "R.V.KOUSIK",
        "DATE",
        "SIGNATURE",
        "POLICE STATION"
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
                print(f"Text: {text}")
                print(f"Layer: {entity.dxf.layer}")
                
                if entity.dxftype() == 'TEXT':
                    print(f"Insert: {entity.dxf.insert}")
                    print(f"Align Point: {getattr(entity.dxf, 'align_point', 'N/A')}")
                    print(f"Halign: {getattr(entity.dxf, 'halign', 0)}")
                    print(f"Valign: {getattr(entity.dxf, 'valign', 0)}")
                    print(f"Height: {getattr(entity.dxf, 'height', 'N/A')}")
                    print(f"Rotation: {getattr(entity.dxf, 'rotation', 0)}")
                elif entity.dxftype() == 'MTEXT':
                    print(f"Insert: {entity.dxf.insert}")
                    print(f"Attachment point: {getattr(entity.dxf, 'attachment_point', 1)}")
                    print(f"Height: {getattr(entity.dxf, 'char_height', 'N/A')}")
                    print(f"Rotation: {getattr(entity.dxf, 'rotation', 0)}")
                    
    # Also check blocks
    for block in doc.blocks:
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
                    print(f"Text: {text}")
                    print(f"Layer: {entity.dxf.layer}")
                    if entity.dxftype() == 'TEXT':
                        print(f"Insert: {entity.dxf.insert}")
                        print(f"Align Point: {getattr(entity.dxf, 'align_point', 'N/A')}")
                        print(f"Halign: {getattr(entity.dxf, 'halign', 0)}")
                        print(f"Valign: {getattr(entity.dxf, 'valign', 0)}")
                    elif entity.dxftype() == 'MTEXT':
                        print(f"Insert: {entity.dxf.insert}")
                        print(f"Attachment point: {getattr(entity.dxf, 'attachment_point', 1)}")

find_texts("e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf")

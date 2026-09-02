import sys
import math
sys.path.insert(0, "e:/viewer_v2/arcos-cad/backend")
from cad.parsers.dxf_parser import ArcosDxfParser

def check_entities():
    parser = ArcosDxfParser("e:/viewer_v2/dxf_files/TERMINALDESIGN PART 2.dxf")
    res = parser.parse()
    
    search_texts = [
        "SCALE",
        "NORTH",
        "R.V.KOUSIK",
        "DATE",
        "SIGNATURE",
        "POLICE STATION",
        "BANDAR ROAD",
        "POLICE CONTROL ROOM"
    ]
    
    def check_space(entities, name_prefix):
        for e in entities:
            text = e.get("text", "")
            for st in search_texts:
                if st in text.upper():
                    print(f"[{name_prefix}] Handle {e['id']} | {e['type']} | {text}")
                    print(f"  Location: {e.get('geometry', {}).get('location')}")
                    print(f"  Halign: {e.get('geometry', {}).get('halign')}")
                    print(f"  Valign: {e.get('geometry', {}).get('valign')}")
                    print(f"  Height: {e.get('geometry', {}).get('height')}")
                    print(f"  Rotation: {e.get('geometry', {}).get('rotation')}")
                    
    check_space(res["entities"], "ModelSpace")
    for b_name, b_data in res.get("blocks", {}).items():
        check_space(b_data["entities"], f"Block {b_name}")
        
check_entities()

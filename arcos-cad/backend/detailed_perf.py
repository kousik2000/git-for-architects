import time
import json
import tracemalloc
import sys

def main(filepath):
    print(f"Profiling {filepath}")
    
    t0 = time.time()
    
    # 1. ezdxf.readfile
    t_read_start = time.time()
    import ezdxf
    doc = ezdxf.readfile(filepath)
    t_read_end = time.time()
    print(f"ezdxf.readfile: {t_read_end - t_read_start:.2f} s")
    
    # 2. ArcosDxfParser
    from cad.parsers.dxf_parser import ArcosDxfParser
    parser = ArcosDxfParser(filepath)
    parser.doc = doc
    
    t_msp_start = time.time()
    parser.msp = parser.doc.modelspace()
    t_msp_end = time.time()
    print(f"Modelspace acquisition: {t_msp_end - t_msp_start:.2f} s")
    
    # Layers
    t_layers_start = time.time()
    parser._extract_layers()
    t_layers_end = time.time()
    print(f"Layer discovery: {t_layers_end - t_layers_start:.2f} s")
    
    # Bounds
    t_bounds_start = time.time()
    parser._extract_bounds()
    t_bounds_end = time.time()
    print(f"Bounds extraction: {t_bounds_end - t_bounds_start:.2f} s")
    
    # Entities
    t_ent_start = time.time()
    parser._extract_entities()
    t_ent_end = time.time()
    print(f"Entity parsing (modelspace): {t_ent_end - t_ent_start:.2f} s")
    print(f"  Total supported entities: {parser.stats['supportedEntities']}")
    
    # Layouts
    t_lay_start = time.time()
    parser._extract_layouts()
    t_lay_end = time.time()
    print(f"Layout parsing: {t_lay_end - t_lay_start:.2f} s")
    
    # Blocks
    t_blk_start = time.time()
    parser._extract_blocks()
    t_blk_end = time.time()
    print(f"Block processing: {t_blk_end - t_blk_start:.2f} s")
    
    # Linetypes
    t_lt_start = time.time()
    parser._extract_linetypes()
    t_lt_end = time.time()
    
    t_total_parse = time.time() - t_read_end
    print(f"Total parsing (excl readfile): {t_total_parse:.2f} s")
    
    # JSON construction
    t_json_start = time.time()
    import math
    def sanitize_floats(obj):
        if isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj): return None
            return obj
        elif isinstance(obj, dict):
            return {k: sanitize_floats(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [sanitize_floats(v) for v in obj]
        return obj

    res = sanitize_floats({
        "filename": "file",
        "stats": parser.stats,
        "warnings": parser.warnings,
        "layers": parser.layers,
        "linetypes": parser.linetypes,
        "bounds": parser.bounds,
        "blocks": parser.blocks,
        "layouts": parser.layouts,
        "entities": parser.entities
    })
    t_json_end = time.time()
    print(f"JSON object construction: {t_json_end - t_json_start:.2f} s")
    
    # Serialization
    t_dump_start = time.time()
    json_str = json.dumps(res)
    t_dump_end = time.time()
    print(f"json.dumps(): {t_dump_end - t_dump_start:.2f} s")
    
    size_mb = len(json_str) / (1024 * 1024)
    print(f"Final JSON size: {size_mb:.2f} MB")
    
    print(f"TOTAL SCRIPT TIME: {time.time() - t0:.2f} s")

if __name__ == '__main__':
    main(sys.argv[1])

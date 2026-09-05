import time
import json
import tracemalloc
import cProfile
import pstats
import io
import sys
import ezdxf

from cad.parsers.dxf_parser import ArcosDxfParser

def wrap_method(cls, method_name, timing_dict, count_dict=None):
    original = getattr(cls, method_name)
    def wrapper(self, *args, **kwargs):
        t0 = time.perf_counter()
        res = original(self, *args, **kwargs)
        dt = time.perf_counter() - t0
        timing_dict[method_name] = timing_dict.get(method_name, 0) + dt
        if count_dict is not None:
            count_dict[method_name] = count_dict.get(method_name, 0) + 1
        return res
    setattr(cls, method_name, wrapper)

def wrap_entity_parse(cls, type_name, timing_dict, count_dict):
    method_name = f'_parse_{type_name.lower()}'
    if not hasattr(cls, method_name):
        return
    original = getattr(cls, method_name)
    def wrapper(self, entity, *args, **kwargs):
        t0 = time.perf_counter()
        res = original(self, entity, *args, **kwargs)
        dt = time.perf_counter() - t0
        timing_dict[type_name] = timing_dict.get(type_name, 0) + dt
        count_dict[type_name] = count_dict.get(type_name, 0) + 1
        return res
    setattr(cls, method_name, wrapper)

def profile_dxf(filepath):
    # Setup tracing
    timings = {}
    counts = {}
    
    for step in ['_extract_layers', '_extract_bounds', '_extract_entities', '_extract_layouts', '_extract_blocks', '_extract_linetypes']:
        wrap_method(ArcosDxfParser, step, timings, counts)
        
    for e_type in ['LINE', 'POLYLINE', 'LWPOLYLINE', 'ARC', 'CIRCLE', 'TEXT', 'MTEXT', 'HATCH', 'INSERT', 'SPLINE', 'DIMENSION', 'LEADER', 'MLEADER', 'SOLID', 'VIEWPORT', 'ELLIPSE']:
        wrap_entity_parse(ArcosDxfParser, e_type, timings, counts)
        
    pr = cProfile.Profile()
    
    print("Loading file...", filepath)
    
    tracemalloc.start()
    mem_before = tracemalloc.get_traced_memory()[0]
    
    parser = ArcosDxfParser(filepath)
    
    t0 = time.perf_counter()
    pr.enable()
    
    t_read_0 = time.perf_counter()
    parser.doc = ezdxf.readfile(parser.filepath)
    parser.msp = parser.doc.modelspace()
    t_read_1 = time.perf_counter()
    timings['ezdxf.readfile'] = t_read_1 - t_read_0
    
    parser._extract_layers()
    parser._extract_bounds()
    parser._extract_entities()
    parser._extract_layouts()
    parser._extract_blocks()
    parser._extract_linetypes()
    
    pr.disable()
    t_parse_end = time.perf_counter()
    timings['total_parse'] = t_parse_end - t0
    
    mem_after_parse = tracemalloc.get_traced_memory()[0]
    
    t_json_0 = time.perf_counter()
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
    t_json_1 = time.perf_counter()
    timings['json_construction'] = t_json_1 - t_json_0
    mem_after_construct = tracemalloc.get_traced_memory()[0]
    
    t_dump_0 = time.perf_counter()
    json_str = json.dumps(res)
    t_dump_1 = time.perf_counter()
    timings['json_dumps'] = t_dump_1 - t_dump_0
    mem_after_dump = tracemalloc.get_traced_memory()[0]
    
    json_size_kb = len(json_str) / 1024
    tracemalloc.stop()
    
    s = io.StringIO()
    ps = pstats.Stats(pr, stream=s).sort_stats('tottime')
    ps.print_stats('virtual_entities')
    profile_out = s.getvalue()
    
    virtual_calls = 0
    virtual_time = 0.0
    for line in profile_out.split('\n'):
        if 'virtual_entities' in line and 'ezdxf' in line:
            parts = line.split()
            if len(parts) >= 6:
                try:
                    virtual_calls += int(parts[0].split('/')[0])
                    virtual_time += float(parts[1])
                except:
                    pass
                    
    out = {
        'timings': timings,
        'counts': counts,
        'memory_mb': {
            'before': mem_before / 1024 / 1024,
            'after_parse': mem_after_parse / 1024 / 1024,
            'after_construct': mem_after_construct / 1024 / 1024,
            'after_dump': mem_after_dump / 1024 / 1024
        },
        'virtual_entities': {
            'calls': virtual_calls,
            'time': virtual_time
        },
        'json_size_kb': json_size_kb
    }
    
    with open('perf_results.json', 'w') as f:
        json.dump(out, f, indent=2)
        
    print("Done. Saved to perf_results.json")

if __name__ == '__main__':
    profile_dxf(sys.argv[1])

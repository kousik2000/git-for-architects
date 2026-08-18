import ezdxf
import json

# Load the parsed_cad.json to know which 15 blocks are referenced
data = json.load(open("../../frontend/src/dummy-json/parsed_cad.json"))
d = data["data"]

inserts = [e for e in d["entities"] if e["type"] == "INSERT"]
referenced_blocks = set(ins["blockName"] for ins in inserts)
print("MSP-referenced blocks:", sorted(referenced_blocks))
print("Count:", len(referenced_blocks))

# Now use F2841747_django_test.dxf which has the same block structure
# but we need the actual canonical DXF
# The canonical file is accessible via the Django DXF which has Mr.Keerti blocks
doc = ezdxf.readfile("F2841747_django_test.dxf")

print()
print("Checking nested INSERTs inside referenced blocks:")

# For each referenced block, walk its entities and find nested INSERTs
def collect_nested_block_names(doc, block_name, visited=None):
    """Recursively collect all block names needed (to avoid missing nested refs)."""
    if visited is None:
        visited = set()
    if block_name in visited:
        return set()
    visited.add(block_name)
    
    needed = set()
    try:
        block = doc.blocks.get(block_name)
        if block is None:
            return needed
        for e in block:
            if e.dxftype() == "INSERT":
                nested_name = e.dxf.name
                needed.add(nested_name)
                needed |= collect_nested_block_names(doc, nested_name, visited)
    except Exception as ex:
        print(f"  Error in block {block_name!r}: {ex}")
    return needed

all_needed = set(referenced_blocks)
for bn in list(referenced_blocks):
    nested = collect_nested_block_names(doc, bn)
    if nested:
        print(f"  Block {bn!r} has nested block refs: {nested}")
        all_needed |= nested

print()
print("Total blocks needed (direct + nested):", len(all_needed))
print("All needed:", sorted(all_needed))

# Also inspect entity types inside each referenced block
print()
print("Entity types inside referenced blocks:")
for bn in sorted(referenced_blocks):
    try:
        block = doc.blocks.get(bn)
        if block is None:
            print(f"  {bn!r}: NOT FOUND in doc.blocks")
            continue
        types = {}
        for e in block:
            types[e.dxftype()] = types.get(e.dxftype(), 0) + 1
        print(f"  {bn!r}: {types}")
    except Exception as ex:
        print(f"  {bn!r}: ERROR - {ex}")

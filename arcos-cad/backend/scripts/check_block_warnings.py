import json

data = json.load(open("parsed_cad_phase5_5.json"))
d = data["data"]
warnings = d.get("warnings", [])

block_errors = [w for w in warnings if w["code"] == "BLOCK_ENTITY_PARSE_ERROR"]
print(f"Block entity parse errors: {len(block_errors)}")

# Show unique error messages
seen = set()
for w in block_errors:
    key = (w.get("entityType"), w["message"][:100])
    if key not in seen:
        seen.add(key)
        print(f"  entityType={w.get('entityType')!r}: {w['message'][:150]}")

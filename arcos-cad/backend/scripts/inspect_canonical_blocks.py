import ezdxf
import json

# The canonical 184-entity drawing blocks
# We have the parsed_cad.json which shows blocks in the canonical file
data = json.load(open("parsed_cad.json"))
d = data["data"]

inserts = [e for e in d["entities"] if e["type"] == "INSERT"]
blocks = {b["name"]: b for b in d["blocks"]}

print("INSERT entities:", len(inserts))
print("Block definitions:", len(blocks))
print()
print("INSERT references:")
for ins in inserts:
    bn = ins["blockName"]
    exists = bn in blocks
    print(f"  INSERT -> {bn!r} (block exists: {exists})")

print()
print("Unique block names referenced by INSERTs:")
used_blocks = set(ins["blockName"] for ins in inserts)
print(f"  {sorted(used_blocks)}")

# Check if any INSERT references a block that is not in the block list
missing = used_blocks - set(blocks.keys())
print(f"Missing blocks: {missing}")

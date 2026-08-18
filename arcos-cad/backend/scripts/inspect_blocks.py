import ezdxf

doc = ezdxf.new("R2010")
msp = doc.modelspace()

inner_block = doc.blocks.new("INNER_BLOCK")
inner_block.add_line((0, 0), (5, 0))
inner_block.add_circle((0, 0), 1.0)

outer_block = doc.blocks.new("OUTER_BLOCK")
outer_block.add_line((0, 0), (10, 0))
outer_block.add_blockref("INNER_BLOCK", insert=(2, 2, 0))

msp.add_blockref("OUTER_BLOCK", insert=(50, 60, 0), dxfattribs={
    "xscale": 1.5, "yscale": 1.5, "zscale": 1.0, "rotation": 30.0,
})
doc.saveas("test_insert.dxf")
doc2 = ezdxf.readfile("test_insert.dxf")

for block in doc2.blocks:
    name = block.name
    if name.startswith("*"):
        continue
    entities = list(block)
    types = {}
    for e in entities:
        types[e.dxftype()] = types.get(e.dxftype(), 0) + 1
    print("Block", repr(name), len(entities), "entities", types)
    for e in entities:
        if e.dxftype() == "INSERT":
            print("  Nested INSERT blockName:", e.dxf.name)
            print("  Nested insert:", e.dxf.insert)

print()
for block in doc2.blocks:
    layout_attr = getattr(block, "is_any_layout", None)
    print("Block", repr(block.name), "is_any_layout:", layout_attr)

import os
os.remove("test_insert.dxf")
print("Done!")

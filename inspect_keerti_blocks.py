import ezdxf

# Use the DXF from the Mr.Keerti drawing via F2841747_django_test
doc = ezdxf.readfile("F2841747_django_test.dxf")

print("All non-layout blocks and their entity types:")
for block in doc.blocks:
    name = block.name
    if name.startswith("*"):
        continue
    entities = list(block)
    types = {}
    for e in entities:
        types[e.dxftype()] = types.get(e.dxftype(), 0) + 1
    # Count nested INSERTs
    nested_inserts = [e for e in entities if e.dxftype() == "INSERT"]
    print(f"Block {name!r}: {len(entities)} entities, types={types}")
    for ni in nested_inserts:
        print(f"  Nested INSERT -> {ni.dxf.name!r}")

print()
# Check ARC entity properties in block
for block in doc.blocks:
    for e in block:
        if e.dxftype() == "ARC":
            print("ARC props: center=%s radius=%s start_angle=%s end_angle=%s" % (
                e.dxf.center, e.dxf.radius, e.dxf.start_angle, e.dxf.end_angle))
            break
    else:
        continue
    break

# Check CIRCLE entity properties
for block in doc.blocks:
    for e in block:
        if e.dxftype() == "CIRCLE":
            print("CIRCLE props: center=%s radius=%s" % (e.dxf.center, e.dxf.radius))
            break
    else:
        continue
    break

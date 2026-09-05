import sys

with open('cad/parsers/dxf_parser.py', 'r') as f:
    content = f.read()

old_code = 'if block_name in self.blocks and self.blocks[block_name].get("bounds"):'
new_code = 'block_name = entity.dxf.name\n        if block_name in self.blocks and self.blocks[block_name].get("bounds"):'

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('cad/parsers/dxf_parser.py', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Failed to find old code")

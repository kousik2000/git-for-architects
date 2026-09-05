import re

with open('cad/parsers/dxf_parser.py', 'r') as f:
    content = f.read()

# 1. Fix _extract_blocks to not use self.entities and self.layouts for discovery
old_discovery = """        # Collect all directly referenced block names from parsed entities (Modelspace)
        directly_referenced = set()
        for entity in self.entities:
            if entity.get("type") == "INSERT":
                directly_referenced.add(entity["blockName"])

        # Phase 5.11B: Collect from PaperSpace layouts as well
        for layout_name, layout_data in self.layouts.items():
            for entity in layout_data.get("entities", []):
                if entity.get("type") == "INSERT":
                    directly_referenced.add(entity["blockName"])"""

new_discovery = """        # Collect directly referenced block names from modelspace and layouts directly
        directly_referenced = set()
        for entity in self.msp:
            if entity.dxftype() == "INSERT":
                directly_referenced.add(entity.dxf.name)
                
        for layout in self.doc.layouts:
            if layout.name == 'Model': continue
            for entity in layout:
                if entity.dxftype() == "INSERT":
                    directly_referenced.add(entity.dxf.name)"""

content = content.replace(old_discovery, new_discovery)

# 2. In _extract_blocks, track bounds while parsing block entities
old_parse_block = """            base_point = self._get_base_point(block)
            block_entities = self._parse_block_entities(block, block_name)

            self.blocks[block_name] = {
                "name": block_name,
                "basePoint": base_point,
                "entities": block_entities
            }"""

new_parse_block = """            base_point = self._get_base_point(block)
            self._current_bounds = {"min": [float('inf'), float('inf')], "max": [float('-inf'), float('-inf')]}
            block_entities = self._parse_block_entities(block, block_name)
            
            block_bounds = None
            if self._current_bounds["min"][0] != float('inf'):
                block_bounds = {
                    "min": [self._current_bounds["min"][0], self._current_bounds["min"][1], 0],
                    "max": [self._current_bounds["max"][0], self._current_bounds["max"][1], 0]
                }
            self._current_bounds = None

            self.blocks[block_name] = {
                "name": block_name,
                "basePoint": base_point,
                "entities": block_entities,
                "bounds": block_bounds
            }"""

content = content.replace(old_parse_block, new_parse_block)

# 3. Modify _parse_insert to use the precomputed block bounds
old_parse_insert = """        props["location"] = [entity.dxf.insert.x, entity.dxf.insert.y, entity.dxf.insert.z]
        self._update_bounds(entity.dxf.insert.x, entity.dxf.insert.y)"""

new_parse_insert = """        insert_pt = [entity.dxf.insert.x, entity.dxf.insert.y, entity.dxf.insert.z]
        props["location"] = insert_pt
        
        # Determine bounds using precomputed block bounds if available
        block_bounds = None
        if block_name in self.blocks and self.blocks[block_name].get("bounds"):
            block_bounds = self.blocks[block_name]["bounds"]
            
        if block_bounds and self._current_bounds:
            import math
            scale_x = props["scale"][0]
            scale_y = props["scale"][1]
            rot = math.radians(props["rotation"])
            cos_r = math.cos(rot)
            sin_r = math.sin(rot)
            
            bmin = block_bounds["min"]
            bmax = block_bounds["max"]
            corners = [
                (bmin[0], bmin[1]),
                (bmax[0], bmin[1]),
                (bmax[0], bmax[1]),
                (bmin[0], bmax[1])
            ]
            
            for cx, cy in corners:
                # scale
                sx = cx * scale_x
                sy = cy * scale_y
                # rotate
                rx = sx * cos_r - sy * sin_r
                ry = sx * sin_r + sy * cos_r
                # translate
                tx = rx + insert_pt[0]
                ty = ry + insert_pt[1]
                self._update_bounds(tx, ty)
        else:
            # Fallback to insertion point
            self._update_bounds(insert_pt[0], insert_pt[1])
"""

content = content.replace(old_parse_insert, new_parse_insert)

# 4. Change order in parse()
content = re.sub(r'self\._extract_entities\(\).*?self\._extract_blocks\(\).*?# Phase 5\.5', 
                 'self._extract_blocks()\n        self._extract_entities()\n        self._extract_layouts()', 
                 content, flags=re.DOTALL)

with open('cad/parsers/dxf_parser.py', 'w') as f:
    f.write(content)

print("Rewrite blocks done!")

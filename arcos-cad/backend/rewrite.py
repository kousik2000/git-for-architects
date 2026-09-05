import re

with open('cad/parsers/dxf_parser.py', 'r') as f:
    content = f.read()

# 1. Add _current_bounds initialization
content = content.replace('self.bounds = None', 'self.bounds = None\n        self._current_bounds = None')

# 2. Add _update_bounds helper
update_bounds_code = """
    def _update_bounds(self, x, y):
        if self._current_bounds:
            if x < self._current_bounds["min"][0]: self._current_bounds["min"][0] = x
            if y < self._current_bounds["min"][1]: self._current_bounds["min"][1] = y
            if x > self._current_bounds["max"][0]: self._current_bounds["max"][0] = x
            if y > self._current_bounds["max"][1]: self._current_bounds["max"][1] = y

    def _extract_bounds(self):"""
content = content.replace('    def _extract_bounds(self):', update_bounds_code)

# 3. Replace _extract_bounds logic completely (just pass since we do it inline)
content = re.sub(
    r'    def _extract_bounds\(self\):.*?self\.bounds = \{.*?\}',
    r'    def _extract_bounds(self):\n        pass',
    content,
    flags=re.DOTALL
)

# 4. Modify _extract_entities to use _current_bounds
extract_entities_code = """    def _extract_entities(self):
        self._current_bounds = {"min": [float('inf'), float('inf')], "max": [float('-inf'), float('-inf')]}
        for entity in self.msp:"""
content = content.replace('    def _extract_entities(self):\n        for entity in self.msp:', extract_entities_code)

extract_entities_end_code = """                    self.entities.append(parsed)

        if self._current_bounds["min"][0] != float('inf'):
            self.bounds = {
                "min": [self._current_bounds["min"][0], self._current_bounds["min"][1], 0],
                "max": [self._current_bounds["max"][0], self._current_bounds["max"][1], 0]
            }
        self._current_bounds = None"""
content = content.replace('                    self.entities.append(parsed)', extract_entities_end_code, 1)

# 5. Modify _extract_layouts to use _current_bounds per layout
extract_layouts_code = """
            self._current_bounds = {"min": [float('inf'), float('inf')], "max": [float('-inf'), float('-inf')]}
            layout_entities = []"""
content = content.replace('            layout_entities = []', extract_layouts_code)

extract_layouts_end_code = """
            layout_bounds = None
            if self._current_bounds["min"][0] != float('inf'):
                layout_bounds = {
                    "min": [self._current_bounds["min"][0], self._current_bounds["min"][1], 0],
                    "max": [self._current_bounds["max"][0], self._current_bounds["max"][1], 0]
                }
            self._current_bounds = None

            self.layouts[layout.name] = {"""
content = re.sub(
    r'            bbox = extents\(layout, fast=True\).*?self\.layouts\[layout\.name\] = \{',
    extract_layouts_end_code,
    content,
    flags=re.DOTALL
)

# 6. Change block extraction order in __init__ (no, it is called in backend.py)
# Wait, ArcosDxfParser is called in backend.py or inside __init__?
# Let's check how it's called. It's called manually or in __init__?
# We'll just change the bounds update inside block parsing.

# 7. Add _update_bounds to all _parse_* functions
content = content.replace('        props["geometry"] = {\n            "start": [entity.dxf.start.x, entity.dxf.start.y, entity.dxf.start.z],\n            "end": [entity.dxf.end.x, entity.dxf.end.y, entity.dxf.end.z]\n        }',
'''        props["geometry"] = {
            "start": [entity.dxf.start.x, entity.dxf.start.y, entity.dxf.start.z],
            "end": [entity.dxf.end.x, entity.dxf.end.y, entity.dxf.end.z]
        }
        self._update_bounds(entity.dxf.start.x, entity.dxf.start.y)
        self._update_bounds(entity.dxf.end.x, entity.dxf.end.y)''')

content = content.replace('        props["geometry"] = {\n            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],\n            "radius": entity.dxf.radius\n        }',
'''        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "radius": entity.dxf.radius
        }
        self._update_bounds(entity.dxf.center.x - entity.dxf.radius, entity.dxf.center.y - entity.dxf.radius)
        self._update_bounds(entity.dxf.center.x + entity.dxf.radius, entity.dxf.center.y + entity.dxf.radius)''')

content = content.replace('        props["geometry"] = {\n            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],\n            "radius": entity.dxf.radius,\n            "startAngle": entity.dxf.start_angle,\n            "endAngle": entity.dxf.end_angle\n        }',
'''        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "radius": entity.dxf.radius,
            "startAngle": entity.dxf.start_angle,
            "endAngle": entity.dxf.end_angle
        }
        self._update_bounds(entity.dxf.center.x - entity.dxf.radius, entity.dxf.center.y - entity.dxf.radius)
        self._update_bounds(entity.dxf.center.x + entity.dxf.radius, entity.dxf.center.y + entity.dxf.radius)''')

content = content.replace('            "closed": closed\n        }\n        return props',
'''            "closed": closed
        }
        for v in vertices:
            self._update_bounds(v[0], v[1])
        return props''')

content = content.replace('        try:\n            insert = entity.dxf.insert\n            geometry["location"] = [insert.x, insert.y, insert.z]\n        except Exception:\n            pass',
'''        try:
            insert = entity.dxf.insert
            geometry["location"] = [insert.x, insert.y, insert.z]
            self._update_bounds(insert.x, insert.y)
        except Exception:
            pass''')

# For insert we update bounds with the insert point for now (zero overhead)
content = content.replace('        props["location"] = [entity.dxf.insert.x, entity.dxf.insert.y, entity.dxf.insert.z]',
'''        props["location"] = [entity.dxf.insert.x, entity.dxf.insert.y, entity.dxf.insert.z]
        self._update_bounds(entity.dxf.insert.x, entity.dxf.insert.y)''')

# Write back
with open('cad/parsers/dxf_parser.py', 'w') as f:
    f.write(content)

print('Rewrite complete!')

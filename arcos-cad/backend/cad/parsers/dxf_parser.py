import ezdxf
import time

class ArcosDxfParser:
    def __init__(self, filepath):
        self.filepath = filepath
        self.doc = None
        self.msp = None
        self.stats = {
            "totalEntities": 0,
            "supportedEntities": 0,
            "unsupportedEntities": 0,
            "layers": 0,
            "blocks": 0,
            "parsingTimeMs": 0,
            "entityTypes": {}
        }
        self.warnings = []
        self.layers = []
        self.blocks = []
        self.entities = []
        self.bounds = {"min": [0, 0, 0], "max": [0, 0, 0]}
        
    def _add_warning(self, code, message, entity_type=None):
        self.warnings.append({
            "code": code,
            "message": message,
            "entityType": entity_type
        })
        
    def parse(self):
        start_time = time.time()
        try:
            self.doc = ezdxf.readfile(self.filepath)
            self.msp = self.doc.modelspace()
        except IOError:
            raise Exception("Not a DXF file or a generic I/O error.")
        except ezdxf.DXFStructureError:
            raise Exception("Invalid or corrupted DXF file.")
            
        self._extract_layers()
        self._extract_blocks()
        self._extract_bounds()
        self._extract_entities()
        
        self.stats["parsingTimeMs"] = int((time.time() - start_time) * 1000)
        
        return {
            "version": "1.0",
            "document": {
                "name": self.filepath.split('/')[-1].split('\\')[-1],
                "format": "DXF"
            },
            "units": {
                "name": None,
                "code": None
            },
            "bounds": self.bounds,
            "layers": self.layers,
            "blocks": self.blocks,
            "layouts": [],
            "entities": self.entities,
            "statistics": self.stats,
            "warnings": self.warnings
        }

    def _extract_layers(self):
        for layer in self.doc.layers:
            self.layers.append({
                "name": layer.dxf.name,
                "color": layer.dxf.color,
                "linetype": layer.dxf.linetype,
                "visible": layer.is_on(),
                "frozen": layer.is_frozen(),
                "locked": layer.is_locked()
            })
        self.stats["layers"] = len(self.layers)

    def _extract_blocks(self):
        for block in self.doc.blocks:
            if not getattr(block, 'is_any_layout', False) and not block.name.startswith('*'):
                base_point = getattr(block.block.dxf, 'base_point', getattr(block.dxf, 'base_point', None)) if hasattr(block, 'block') else getattr(block.dxf, 'base_point', None)
                bx, by, bz = (base_point.x, base_point.y, base_point.z) if base_point else (0, 0, 0)
                self.blocks.append({
                    "name": block.name,
                    "basePoint": [bx, by, bz]
                })
        self.stats["blocks"] = len(self.blocks)

    def _extract_bounds(self):
        from ezdxf.bbox import extents
        bbox = extents(self.msp)
        if bbox.extmax and bbox.extmin:
            self.bounds = {
                "min": [bbox.extmin.x, bbox.extmin.y, bbox.extmin.z],
                "max": [bbox.extmax.x, bbox.extmax.y, bbox.extmax.z]
            }

    def _extract_entities(self):
        for entity in self.msp:
            self.stats["totalEntities"] += 1
            e_type = entity.dxftype()
            
            self.stats["entityTypes"][e_type] = self.stats["entityTypes"].get(e_type, 0) + 1
            
            parsed = None
            try:
                if e_type == "LINE":
                    parsed = self._parse_line(entity)
                elif e_type == "CIRCLE":
                    parsed = self._parse_circle(entity)
                elif e_type == "ARC":
                    parsed = self._parse_arc(entity)
                elif e_type in ["LWPOLYLINE", "POLYLINE"]:
                    parsed = self._parse_polyline(entity)
                elif e_type == "ELLIPSE":
                    parsed = self._parse_ellipse(entity)
                elif e_type == "SPLINE":
                    parsed = self._parse_spline(entity)
                elif e_type == "POINT":
                    parsed = self._parse_point(entity)
                elif e_type in ["TEXT", "MTEXT"]:
                    parsed = self._parse_text(entity)
                elif e_type == "HATCH":
                    parsed = self._parse_hatch(entity)
                elif e_type == "INSERT":
                    parsed = self._parse_insert(entity)
                else:
                    self.stats["unsupportedEntities"] += 1
                    self._add_warning("UNSUPPORTED_ENTITY", "Entity type not fully mapped.", e_type)
            except Exception as e:
                self.stats["unsupportedEntities"] += 1
                self._add_warning("ENTITY_PARSE_ERROR", str(e), e_type)
                
            if parsed:
                self.stats["supportedEntities"] += 1
                self.entities.append(parsed)

    def _base_props(self, entity):
        return {
            "id": entity.dxf.handle,
            "type": entity.dxftype(),
            "layer": entity.dxf.layer,
            "style": {
                "color": entity.dxf.color,
                "linetype": entity.dxf.linetype if entity.dxf.hasattr('linetype') else None,
                "lineweight": entity.dxf.lineweight if entity.dxf.hasattr('lineweight') else None
            }
        }

    def _parse_line(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "start": [entity.dxf.start.x, entity.dxf.start.y, entity.dxf.start.z],
            "end": [entity.dxf.end.x, entity.dxf.end.y, entity.dxf.end.z]
        }
        return props

    def _parse_circle(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "radius": entity.dxf.radius
        }
        return props

    def _parse_arc(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "radius": entity.dxf.radius,
            "startAngle": entity.dxf.start_angle,
            "endAngle": entity.dxf.end_angle
        }
        return props

    def _parse_polyline(self, entity):
        props = self._base_props(entity)
        vertices = []
        closed = False
        
        if entity.dxftype() == 'LWPOLYLINE':
            closed = entity.closed
            for point in entity.get_points(format='xy'):
                vertices.append([point[0], point[1], 0.0])
        elif entity.dxftype() == 'POLYLINE':
            closed = entity.is_closed
            for vertex in entity.vertices:
                vertices.append([vertex.dxf.location.x, vertex.dxf.location.y, vertex.dxf.location.z])
                
        props["geometry"] = {
            "vertices": vertices,
            "closed": closed
        }
        return props

    def _parse_ellipse(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "majorAxis": [entity.dxf.major_axis.x, entity.dxf.major_axis.y, entity.dxf.major_axis.z],
            "ratio": entity.dxf.ratio,
            "startParam": entity.dxf.start_param,
            "endParam": entity.dxf.end_param
        }
        return props

    def _parse_spline(self, entity):
        props = self._base_props(entity)
        control_points = []
        for pt in entity.control_points:
            control_points.append([pt.x, pt.y, pt.z])
        props["geometry"] = {
            "controlPoints": control_points,
            "closed": entity.closed,
            "degree": entity.dxf.degree
        }
        return props

    def _parse_point(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "location": [entity.dxf.location.x, entity.dxf.location.y, entity.dxf.location.z]
        }
        return props

    def _parse_text(self, entity):
        props = self._base_props(entity)
        # Using insert/align_point depending on entity type properties. For basic MVP:
        pt = getattr(entity.dxf, 'insert', getattr(entity.dxf, 'align_point', None))
        location = [pt.x, pt.y, pt.z] if pt else [0, 0, 0]
        props["geometry"] = {
            "location": location
        }
        props["text"] = entity.dxf.text if hasattr(entity.dxf, 'text') else entity.text
        return props

    def _parse_hatch(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "solid_fill": entity.dxf.solid_fill,
            "pattern_name": entity.dxf.pattern_name
        }
        return props

    def _parse_insert(self, entity):
        props = self._base_props(entity)
        props["blockName"] = entity.dxf.name
        props["geometry"] = {
            "insertionPoint": [entity.dxf.insert.x, entity.dxf.insert.y, entity.dxf.insert.z],
            "rotation": entity.dxf.rotation,
            "scale": [entity.dxf.xscale, entity.dxf.yscale, entity.dxf.zscale]
        }
        return props

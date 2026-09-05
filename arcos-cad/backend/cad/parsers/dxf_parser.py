import ezdxf
import time

# Phase 5.5: ARCOS DXF Parser with expanded schema for HATCH, INSERT/BLOCK, and TEXT metadata.
#
# Schema contract (clean boundary between Django/ezdxf and the Three.js renderer):
#
# LINE:        geometry.start / geometry.end                        -- UNCHANGED
# LWPOLYLINE:  geometry.vertices [x, y, z, bulge]                  -- UNCHANGED
# TEXT:        geometry.location + optional height/rotation/halign/valign  -- EXPANDED
# HATCH:       geometry.solidFill / patternName / boundaryPaths     -- NEW FULL SCHEMA
# INSERT:      blockName + geometry.insertionPoint/rotation/scale   -- UNCHANGED
# blocks:      dict keyed by name, only MSP-referenced blocks, with full entities  -- NEW


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
        # Phase 5.5: blocks is now a dict keyed by block name.
        # Only blocks referenced (directly or transitively) by modelspace INSERTs
        # are included -- each entry carries full serialized entities.
        self.blocks = {}
        self.layouts = {} # Phase 5.11B: PaperSpace layouts
        self.entities = []
        self.linetypes = {}
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
        self._extract_bounds()
        self._extract_blocks()
        self._extract_entities()
        self._extract_layouts()
        self._extract_linetypes()      # Phase 5.9A: extract linetype patterns

        self.stats["parsingTimeMs"] = int((time.time() - start_time) * 1000)

        import math

        def sanitize_floats(obj):
            if isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return None
                return obj
            elif isinstance(obj, dict):
                return {k: sanitize_floats(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [sanitize_floats(v) for v in obj]
            return obj

        return sanitize_floats({
            "version": "1.0",
            "document": {
                "name": self.filepath.split("/")[-1].split("\\")[-1],
                "format": "DXF"
            },
            "units": {
                "name": None,
                "code": None,
                "ltscale": self.doc.header.get("$LTSCALE", 1.0)
            },
            "bounds": self.bounds,
            "layers": self.layers,
            "linetypes": self.linetypes,
            "blocks": self.blocks,
            "layouts": self.layouts,
            "entities": self.entities,
            "statistics": self.stats,
            "warnings": self.warnings
        })

    # ------------------------------------------------------------------
    # Layer extraction (unchanged)
    # ------------------------------------------------------------------

    def _extract_linetypes(self):
        for lt in self.doc.linetypes:
            name = lt.dxf.name
            pattern = []
            if hasattr(lt, "pattern_tags") and hasattr(lt.pattern_tags, "tags"):
                pattern = [t.value for t in lt.pattern_tags.tags if t.code == 49]
            self.linetypes[name] = {
                "pattern": pattern
            }

    def _extract_layers(self):
        for layer in self.doc.layers:
            layer_info = {
                "name": layer.dxf.name,
                "color": layer.dxf.color,
                "linetype": layer.dxf.linetype,
                "visible": layer.is_on(),
                "frozen": layer.is_frozen(),
                "locked": layer.is_locked()
            }
            if layer.dxf.hasattr("true_color"):
                layer_info["trueColor"] = layer.dxf.true_color
            self.layers.append(layer_info)
        self.stats["layers"] = len(self.layers)

    # ------------------------------------------------------------------
    # Bounds extraction (unchanged)
    # ------------------------------------------------------------------


    def _update_bounds(self, x, y):
        if self._current_bounds:
            if x < self._current_bounds["min"][0]: self._current_bounds["min"][0] = x
            if y < self._current_bounds["min"][1]: self._current_bounds["min"][1] = y
            if x > self._current_bounds["max"][0]: self._current_bounds["max"][0] = x
            if y > self._current_bounds["max"][1]: self._current_bounds["max"][1] = y

    def _extract_bounds(self):
        pass

    # ------------------------------------------------------------------
    # Block extraction -- Phase 5.5
    #
    # Only exports blocks that are directly or transitively referenced by
    # INSERT entities in the modelspace.  Nested INSERTs inside blocks are
    # preserved as INSERT references (not recursively flattened) to avoid
    # infinite recursion and JSON bloat.
    #
    # Schema change from Phase 5.4:
    #   Before: "blocks": [{"name": "X", "basePoint": [...]}, ...]
    #   After:  "blocks": {"X": {"name": "X", "basePoint": [...], "entities": [...]}}
    # ------------------------------------------------------------------

    def _collect_needed_block_names(self, block_name, visited=None):
        """
        Recursively collect all block names transitively needed by block_name.
        Uses a visited set to protect against circular references.
        Returns a set containing block_name and all transitively nested block names.
        """
        if visited is None:
            visited = set()
        if block_name in visited:
            return set()
        visited.add(block_name)
        needed = {block_name}
        try:
            block = self.doc.blocks.get(block_name)
            if block is None:
                return needed
            for entity in block:
                if entity.dxftype() == "INSERT":
                    nested_name = entity.dxf.name
                    needed |= self._collect_needed_block_names(nested_name, visited)
        except Exception as ex:
            self._add_warning(
                "BLOCK_TRAVERSE_ERROR",
                "Error traversing block '{}': {}".format(block_name, ex),
                "INSERT"
            )
        return needed

    def _get_base_point(self, block):
        """Extract basePoint from a block definition safely."""
        try:
            bp = block.block.dxf.base_point
            return [bp.x, bp.y, bp.z]
        except Exception:
            pass
        try:
            bp = block.dxf.base_point
            return [bp.x, bp.y, bp.z]
        except Exception:
            pass
        return [0, 0, 0]

    def _extract_blocks(self):
        """
        Build the blocks dict containing only blocks referenced (directly or
        transitively) by INSERT entities in the modelspace and layouts.
        Each block entry carries full serialized entities using the same parsers
        as the modelspace.
        """
        # Collect directly referenced block names from modelspace and layouts directly
        directly_referenced = set()
        for entity in self.msp:
            if entity.dxftype() == "INSERT":
                directly_referenced.add(entity.dxf.name)
                
        for layout in self.doc.layouts:
            if layout.name == 'Model': continue
            for entity in layout:
                if entity.dxftype() == "INSERT":
                    directly_referenced.add(entity.dxf.name)

        # Recursively expand to include transitively nested blocks
        needed_blocks = set()
        for bn in directly_referenced:
            needed_blocks |= self._collect_needed_block_names(bn)

        # Build the block dict entries
        for block_name in sorted(needed_blocks):
            block = self.doc.blocks.get(block_name)
            if block is None:
                self._add_warning(
                    "MISSING_BLOCK",
                    "Block '{}' referenced by INSERT but not found in document.".format(block_name),
                    "INSERT"
                )
                continue

            base_point = self._get_base_point(block)
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
            }

        self.stats["blocks"] = len(self.blocks)

    def _parse_block_entities(self, block, block_name):
        """
        Parse all entities inside a block definition using the same serializers
        as the modelspace.  Nested INSERT entities are preserved as INSERT
        references (not expanded recursively).
        Unsupported entity types are silently skipped (no stats penalty).
        """
        result = []
        for entity in block:
            self.stats["totalEntities"] += 1
            e_type = entity.dxftype()
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
                elif e_type == "SOLID":
                    parsed = self._parse_solid(entity)
                elif e_type == "INSERT":
                    # Preserve nested INSERT as a reference -- do NOT expand recursively
                    parsed = self._parse_insert(entity)
                elif e_type in ["DIMENSION", "LEADER", "MLEADER", "ARC_DIMENSION"]:
                    parsed = self._parse_dimension(entity)
                elif e_type == "VIEWPORT":
                    parsed = self._parse_viewport(entity)
                # else: silently skip ATTDEF, SEQEND, SOLID, and other block-internal types
            except Exception as ex:
                self._add_warning(
                    "BLOCK_ENTITY_PARSE_ERROR",
                    "Error parsing {} in block '{}': {}".format(e_type, block_name, ex),
                    e_type
                )
            if parsed:
                result.append(parsed)
        return result

    # ------------------------------------------------------------------
    # Modelspace entity extraction (unchanged flow)
    # ------------------------------------------------------------------

    def _extract_entities(self):
        self._current_bounds = {"min": [float('inf'), float('inf')], "max": [float('-inf'), float('-inf')]}
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
                elif e_type == "SOLID":
                    parsed = self._parse_solid(entity)
                elif e_type == "INSERT":
                    parsed = self._parse_insert(entity)
                elif e_type in ["DIMENSION", "LEADER", "MLEADER", "ARC_DIMENSION"]:
                    parsed = self._parse_dimension(entity)
                elif e_type == "VIEWPORT":
                    parsed = self._parse_viewport(entity)
                else:
                    # Intentionally filtered: IMAGE, OLE2FRAME, etc.
                    self.stats["unsupportedEntities"] += 1
                    self._add_warning("UNSUPPORTED_ENTITY", "Entity type not fully mapped.", e_type)
            except Exception as e:
                self.stats["unsupportedEntities"] += 1
                self._add_warning("ENTITY_PARSE_ERROR", str(e), e_type)

            if parsed:
                self.stats["supportedEntities"] += 1
                self.entities.append(parsed)
                
        if self._current_bounds["min"][0] != float('inf'):
            self.bounds = {
                "min": [self._current_bounds["min"][0], self._current_bounds["min"][1], 0],
                "max": [self._current_bounds["max"][0], self._current_bounds["max"][1], 0]
            }
        self._current_bounds = None

    # ------------------------------------------------------------------
    # PaperSpace entity extraction -- Phase 5.11B
    # ------------------------------------------------------------------

    def _extract_layouts(self):
        from ezdxf.bbox import extents
        for layout in self.doc.layouts:
            if layout.name == 'Model':
                continue # Modelspace is handled in _extract_entities


            self._current_bounds = {"min": [float('inf'), float('inf')], "max": [float('-inf'), float('-inf')]}
            layout_entities = []
            for entity in layout:
                self.stats["totalEntities"] += 1
                e_type = entity.dxftype()
                
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
                    elif e_type == "SOLID":
                        parsed = self._parse_solid(entity)
                    elif e_type == "INSERT":
                        # Preserve nested INSERT as a reference -- do NOT expand recursively
                        parsed = self._parse_insert(entity)
                    elif e_type in ["DIMENSION", "LEADER", "MLEADER", "ARC_DIMENSION"]:
                        parsed = self._parse_dimension(entity)
                    elif e_type == "VIEWPORT":
                        parsed = self._parse_viewport(entity)
                    # else: silently skip ATTDEF, SEQEND, SOLID, and other layout-internal types
                except Exception as ex:
                    self._add_warning(
                        "LAYOUT_ENTITY_PARSE_ERROR",
                        "Error parsing {} in layout '{}': {}".format(e_type, layout.name, ex),
                        e_type
                    )
                if parsed:
                    layout_entities.append(parsed)


            layout_bounds = None
            if self._current_bounds["min"][0] != float('inf'):
                layout_bounds = {
                    "min": [self._current_bounds["min"][0], self._current_bounds["min"][1], 0],
                    "max": [self._current_bounds["max"][0], self._current_bounds["max"][1], 0]
                }
            self._current_bounds = None

            self.layouts[layout.name] = {
                "name": layout.name,
                "entities": layout_entities,
                "bounds": layout_bounds
            }

    # ------------------------------------------------------------------
    # Base properties helper (unchanged)
    # ------------------------------------------------------------------

    def _base_props(self, entity):
        style = {
            "color": entity.dxf.color,
            "linetype": entity.dxf.linetype if entity.dxf.hasattr("linetype") else None,
            "lineweight": entity.dxf.lineweight if entity.dxf.hasattr("lineweight") else None
        }
        if entity.dxf.hasattr("true_color"):
            style["trueColor"] = entity.dxf.true_color
        if entity.dxf.hasattr("ltscale"):
            style["ltscale"] = entity.dxf.ltscale

        return {
            "id": entity.dxf.handle,
            "type": entity.dxftype(),
            "layer": entity.dxf.layer,
            "style": style
        }

    # ------------------------------------------------------------------
    # Geometry parsers -- LINE / CIRCLE / ARC / POLYLINE (all UNCHANGED)
    # ------------------------------------------------------------------

    def _parse_line(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "start": [entity.dxf.start.x, entity.dxf.start.y, entity.dxf.start.z],
            "end": [entity.dxf.end.x, entity.dxf.end.y, entity.dxf.end.z]
        }
        self._update_bounds(entity.dxf.start.x, entity.dxf.start.y)
        self._update_bounds(entity.dxf.end.x, entity.dxf.end.y)
        return props

    def _parse_circle(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "radius": entity.dxf.radius
        }
        self._update_bounds(entity.dxf.center.x - entity.dxf.radius, entity.dxf.center.y - entity.dxf.radius)
        self._update_bounds(entity.dxf.center.x + entity.dxf.radius, entity.dxf.center.y + entity.dxf.radius)
        return props

    def _parse_arc(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y, entity.dxf.center.z],
            "radius": entity.dxf.radius,
            "startAngle": entity.dxf.start_angle,
            "endAngle": entity.dxf.end_angle
        }
        self._update_bounds(entity.dxf.center.x - entity.dxf.radius, entity.dxf.center.y - entity.dxf.radius)
        self._update_bounds(entity.dxf.center.x + entity.dxf.radius, entity.dxf.center.y + entity.dxf.radius)
        return props

    def _parse_polyline(self, entity):
        props = self._base_props(entity)
        vertices = []
        closed = False

        if entity.dxftype() == "LWPOLYLINE":
            closed = entity.closed
            for point in entity.get_points(format="xyb"):
                # point is (x, y, bulge) -- stored as [x, y, z, bulge]
                vertices.append([point[0], point[1], 0.0, point[2]])
        elif entity.dxftype() == "POLYLINE":
            closed = entity.is_closed
            for vertex in entity.vertices:
                bulge = getattr(vertex.dxf, "bulge", 0.0)
                vertices.append([vertex.dxf.location.x, vertex.dxf.location.y, vertex.dxf.location.z, bulge])

        props["geometry"] = {
            "vertices": vertices,
            "closed": closed
        }
        for v in vertices:
            self._update_bounds(v[0], v[1])
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
            try:
                control_points.append([pt.x, pt.y, pt.z])
            except AttributeError:
                z = pt[2] if len(pt) > 2 else 0.0
                control_points.append([pt[0], pt[1], z])
                
        geometry = {
            "controlPoints": control_points,
            "closed": entity.closed,
            "degree": entity.dxf.degree
        }
        
        if hasattr(entity, "knots") and len(entity.knots) > 0:
            geometry["knots"] = list(entity.knots)
            
        if hasattr(entity, "weights") and len(entity.weights) > 0:
            geometry["weights"] = list(entity.weights)
            
        if hasattr(entity, "fit_points") and len(entity.fit_points) > 0:
            fit_points = []
            for pt in entity.fit_points:
                try:
                    fit_points.append([pt.x, pt.y, pt.z])
                except AttributeError:
                    z = pt[2] if len(pt) > 2 else 0.0
                    fit_points.append([pt[0], pt[1], z])
            geometry["fitPoints"] = fit_points
            
        if hasattr(entity.dxf, "flags"):
            flags = entity.dxf.flags
            geometry["rational"] = bool(flags & 4) # 4 = SPLINE_RATIONAL
            geometry["periodic"] = bool(flags & 2) # 2 = SPLINE_PERIODIC
            
        props["geometry"] = geometry
        return props

    def _parse_point(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "location": [entity.dxf.location.x, entity.dxf.location.y, entity.dxf.location.z]
        }
        return props

    # ------------------------------------------------------------------
    # TEXT -- Phase 5.5 expansion
    #
    # Adds optional height, rotation, halign, valign to geometry.
    # All optional fields are omitted when not present in the DXF entity.
    # location comes from dxf.insert (the TEXT insertion point).
    # text remains at the top level per the existing convention.
    #
    # halign values: 0=LEFT 1=CENTER 2=RIGHT 3=ALIGNED 4=MIDDLE 5=FIT
    # valign values: 0=BASELINE 1=BOTTOM 2=MIDDLE 3=TOP
    # ------------------------------------------------------------------

    def _parse_text(self, entity):
        props = self._base_props(entity)
        geometry = {}

        # Optional TEXT metadata -- include only when actually present in the DXF
        try:
            height = entity.dxf.get("height", None)
        except Exception:
            try:
                height = entity.dxf.get("char_height", None)
            except Exception:
                height = None

        if height is not None:
            geometry["height"] = height

        try:
            rotation = entity.dxf.get("rotation", None)
        except Exception:
            rotation = None
            
        if rotation is None:
            try:
                dir_vec = entity.dxf.get("text_direction", None)
                if dir_vec is not None:
                    import math
                    rotation = math.degrees(math.atan2(dir_vec.y, dir_vec.x))
            except Exception:
                pass
                
        if rotation is not None:
            geometry["rotation"] = rotation

        halign = 0
        valign = 0
        try:
            h = entity.dxf.get("halign", None)
            if h is not None:
                halign = h
                geometry["halign"] = halign
        except Exception:
            pass

        try:
            v = entity.dxf.get("valign", None)
            if v is not None:
                valign = v
                geometry["valign"] = valign
        except Exception:
            pass

        # Location: prefer insert point; but for aligned TEXT, use align_point
        pt = entity.dxf.get("insert", None)
        
        if entity.dxftype() == "TEXT" and (halign != 0 or valign != 0):
            pt = entity.dxf.get("align_point", pt)

        location = [pt.x, pt.y, pt.z] if pt else [0.0, 0.0, 0.0]
        geometry["location"] = location
            
        if entity.dxftype() == "MTEXT":
            try:
                attachment = entity.dxf.get("attachment_point", None)
                if attachment is not None:
                    # MTEXT Attachment point mapping to TEXT halign/valign
                    # 1=TL, 2=TC, 3=TR, 4=ML, 5=MC, 6=MR, 7=BL, 8=BC, 9=BR
                    # halign: 0=Left, 1=Center, 2=Right
                    # valign: 1=Bottom, 2=Middle, 3=Top
                    h_map = {1:0, 2:1, 3:2, 4:0, 5:1, 6:2, 7:0, 8:1, 9:2}
                    v_map = {1:3, 2:3, 3:3, 4:2, 5:2, 6:2, 7:1, 8:1, 9:1}
                    halign = h_map.get(attachment, 0)
                    valign = v_map.get(attachment, 3)
                    geometry["halign"] = halign
                    geometry["valign"] = valign
                    
                # Investigate MTEXT formatting before calling plain_text
                raw_text = getattr(entity, 'text', '').lower()
                if r"\pxqc;" in raw_text:
                    geometry["halign"] = 1
                elif r"\pxqr;" in raw_text:
                    geometry["halign"] = 2
                elif r"\pxql;" in raw_text:
                    geometry["halign"] = 0
            except Exception:
                pass

        props["geometry"] = geometry

        # text at top level (existing convention)
        if entity.dxftype() == "MTEXT" and hasattr(entity, "plain_text"):
            props["text"] = entity.plain_text()
        elif entity.dxf.hasattr("text"):
            props["text"] = entity.dxf.text
        elif hasattr(entity, "text"):
            props["text"] = entity.text
        else:
            props["text"] = ""

        return props

    # ------------------------------------------------------------------
    # HATCH -- Phase 5.5 expansion
    #
    # Replaces the minimal solid_fill / pattern_name stub with full
    # boundary path geometry.
    #
    # Schema:
    #   geometry.solidFill       bool
    #   geometry.patternName     str
    #   geometry.boundaryPaths   list of path objects
    #
    # Supported path types:
    #   EdgePath  (canonical in the project DXF -- only type found)
    #     edges: LineEdge, ArcEdge, EllipseEdge, SplineEdge
    #   PolylinePath
    #
    # pathTypeFlags bit meaning (DXF standard):
    #   bit 0 (1)  = outer boundary
    #   bit 1 (2)  = hole
    #   bit 2 (4)  = textbox
    #   others: see DXF spec
    # ------------------------------------------------------------------

    def _serialize_hatch_edge(self, edge):
        """Serialize a single HATCH boundary edge to a JSON-safe dict."""
        from ezdxf.entities.boundary_paths import LineEdge, ArcEdge, EllipseEdge, SplineEdge

        if isinstance(edge, LineEdge):
            return {
                "type": "LineEdge",
                "start": [edge.start[0], edge.start[1]],
                "end": [edge.end[0], edge.end[1]]
            }
        elif isinstance(edge, ArcEdge):
            return {
                "type": "ArcEdge",
                "center": [edge.center[0], edge.center[1]],
                "radius": edge.radius,
                "startAngle": edge.start_angle,
                "endAngle": edge.end_angle,
                "ccw": edge.ccw
            }
        elif isinstance(edge, EllipseEdge):
            return {
                "type": "EllipseEdge",
                "center": [edge.center[0], edge.center[1]],
                "majorAxisEndPoint": [edge.major_axis[0], edge.major_axis[1]],
                "ratio": edge.ratio,
                "startAngle": edge.start_angle,
                "endAngle": edge.end_angle,
                "ccw": edge.ccw
            }
        elif isinstance(edge, SplineEdge):
            return {
                "type": "SplineEdge",
                "degree": edge.degree,
                "controlPoints": [[pt[0], pt[1]] for pt in edge.control_points],
                "knots": list(edge.knot_values),
                "weights": list(edge.weights)
            }
        else:
            # Unrecognised edge type -- return a minimal placeholder for diagnostics
            return {"type": type(edge).__name__}

    def _serialize_hatch_path(self, path):
        """Serialize a single HATCH boundary path to a JSON-safe dict."""
        from ezdxf.entities.boundary_paths import EdgePath, PolylinePath

        if isinstance(path, EdgePath):
            edges = []
            for edge in path.edges:
                try:
                    edges.append(self._serialize_hatch_edge(edge))
                except Exception as ex:
                    self._add_warning(
                        "HATCH_EDGE_ERROR",
                        "Error serializing hatch edge {}: {}".format(type(edge).__name__, ex),
                        "HATCH"
                    )
            return {
                "type": "EdgePath",
                "pathTypeFlags": path.path_type_flags,
                "edges": edges
            }
        elif isinstance(path, PolylinePath):
            # vertices: list of (x, y, bulge)
            verts = [[v[0], v[1], v[2]] for v in path.vertices]
            return {
                "type": "PolylinePath",
                "pathTypeFlags": path.path_type_flags,
                "isClosed": path.is_closed,
                "vertices": verts
            }
        else:
            # Unknown path type -- preserve type name for diagnostics
            return {
                "type": type(path).__name__,
                "pathTypeFlags": getattr(path, "path_type_flags", 0)
            }

    def _parse_hatch(self, entity):
        props = self._base_props(entity)

        boundary_paths = []
        for path in entity.paths:
            try:
                boundary_paths.append(self._serialize_hatch_path(path))
            except Exception as ex:
                self._add_warning(
                    "HATCH_PATH_ERROR",
                    "Error serializing hatch path: {}".format(ex),
                    "HATCH"
                )

        props["geometry"] = {
            "solidFill": bool(entity.dxf.solid_fill),
            "patternName": entity.dxf.pattern_name,
            "boundaryPaths": boundary_paths
        }
        return props

    # ------------------------------------------------------------------
    # INSERT -- Phase 5.5: entity JSON UNCHANGED
    # The block geometry is resolved via blocks[blockName] at render time.
    # Using .get() with defaults to be robust against missing optional attrs.
    # ------------------------------------------------------------------

    def _parse_insert(self, entity):
        props = self._base_props(entity)
        block_name = entity.dxf.name
        props["blockName"] = block_name
        
        insert_pt = [entity.dxf.insert.x, entity.dxf.insert.y, entity.dxf.insert.z]
        scale_x = entity.dxf.get("xscale", 1.0)
        scale_y = entity.dxf.get("yscale", 1.0)
        rot_deg = entity.dxf.get("rotation", 0.0)
        
        props["geometry"] = {
            "insertionPoint": insert_pt,
            "rotation": rot_deg,
            "scale": [
                scale_x,
                scale_y,
                entity.dxf.get("zscale", 1.0)
            ]
        }
        
        block_bounds = None
        if block_name in self.blocks and self.blocks[block_name].get("bounds"):
            block_bounds = self.blocks[block_name]["bounds"]
            
        if block_bounds and self._current_bounds:
            import math
            rot = math.radians(rot_deg)
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
                sx = cx * scale_x
                sy = cy * scale_y
                rx = sx * cos_r - sy * sin_r
                ry = sx * sin_r + sy * cos_r
                tx = rx + insert_pt[0]
                ty = ry + insert_pt[1]
                self._update_bounds(tx, ty)
        else:
            self._update_bounds(insert_pt[0], insert_pt[1])
            
        return props

    def _parse_solid(self, entity):
        style = self._get_style(entity)
        vertices = []
        try:
            vertices.append([entity.dxf.vtx0.x, entity.dxf.vtx0.y, entity.dxf.vtx0.z])
            vertices.append([entity.dxf.vtx1.x, entity.dxf.vtx1.y, entity.dxf.vtx1.z])
            vertices.append([entity.dxf.vtx2.x, entity.dxf.vtx2.y, entity.dxf.vtx2.z])
            if hasattr(entity.dxf, 'vtx3') and entity.dxf.vtx3 is not None:
                vertices.append([entity.dxf.vtx3.x, entity.dxf.vtx3.y, entity.dxf.vtx3.z])
            else:
                vertices.append([entity.dxf.vtx2.x, entity.dxf.vtx2.y, entity.dxf.vtx2.z])
        except Exception:
            return None
        return { 'type': 'SOLID', 'layer': entity.dxf.layer, 'style': style, 'geometry': { 'vertices': vertices } }

    def _parse_dimension(self, entity):
        props = self._base_props(entity)
        virtual_entities = []
        try:
            for v_ent in entity.virtual_entities():
                e_type = v_ent.dxftype()
                parsed = None
                try:
                    if e_type == "LINE":
                        parsed = self._parse_line(v_ent)
                    elif e_type == "CIRCLE":
                        parsed = self._parse_circle(v_ent)
                    elif e_type == "ARC":
                        parsed = self._parse_arc(v_ent)
                    elif e_type in ["LWPOLYLINE", "POLYLINE"]:
                        parsed = self._parse_polyline(v_ent)
                    elif e_type == "ELLIPSE":
                        parsed = self._parse_ellipse(v_ent)
                    elif e_type == "SPLINE":
                        parsed = self._parse_spline(v_ent)
                    elif e_type == "POINT":
                        parsed = self._parse_point(v_ent)
                    elif e_type in ["TEXT", "MTEXT"]:
                        parsed = self._parse_text(v_ent)
                    elif e_type == "HATCH":
                        parsed = self._parse_hatch(v_ent)
                    elif e_type == "SOLID":
                        parsed = self._parse_solid(v_ent)
                    elif e_type == "INSERT":
                        parsed = self._parse_insert(v_ent)
                    elif e_type == "VIEWPORT":
                        parsed = self._parse_viewport(v_ent)
                except Exception:
                    pass
                if parsed:
                    virtual_entities.append(parsed)
        except Exception as ex:
            self._add_warning("DIMENSION_VIRTUAL_ENTITIES_ERROR", str(ex), entity.dxftype())
            
        props["geometry"] = {
            "virtualEntities": virtual_entities
        }
        
        # Phase 5.15B: Detect missing default arrowheads on LEADER
        if entity.dxftype() == 'LEADER':
            try:
                vertices = [ [v[0], v[1], v[2]] for v in entity.vertices ]
                if len(vertices) >= 2:
                    dimstyle = self.doc.dimstyles.get(entity.dxf.dimstyle)
                    dimblk = dimstyle.dxf.get('dimblk', '') if dimstyle else ''
                    if dimblk == '' or dimblk == '""':
                        dimasz = dimstyle.dxf.get('dimasz', self.doc.header.get('$DIMASZ', 2.5)) if dimstyle else self.doc.header.get('$DIMASZ', 2.5)
                        
                        # Check for dimension style overrides in XDATA
                        if entity.has_xdata('ACAD'):
                            xdata = entity.get_xdata('ACAD')
                            i = 0
                            while i < len(xdata):
                                tag = xdata[i]
                                if tag.code == 1070 and tag.value == 41: # 41 is dimasz override
                                    if i + 1 < len(xdata) and xdata[i+1].code == 1040:
                                        dimasz = xdata[i+1].value
                                        break
                                i += 1

                        props["geometry"]["arrowhead"] = {
                            "type": "closed_filled",
                            "size": dimasz,
                            "p1": vertices[0],
                            "p2": vertices[1]
                        }
            except Exception as e:
                self._add_warning("LEADER_ARROW_ERROR", str(e), entity.dxftype())
                
        return props

    def _parse_viewport(self, entity):
        props = self._base_props(entity)
        props["geometry"] = {
            "center": [entity.dxf.center.x, entity.dxf.center.y],
            "width": entity.dxf.width,
            "height": entity.dxf.height,
            "viewCenter": [entity.dxf.view_center_point.x, entity.dxf.view_center_point.y],
            "viewHeight": entity.dxf.view_height,
            "status": entity.dxf.status
        }
        if entity.dxf.hasattr("view_direction_vector"):
            props["geometry"]["viewDirection"] = [entity.dxf.view_direction_vector.x, entity.dxf.view_direction_vector.y, entity.dxf.view_direction_vector.z]
        else:
            props["geometry"]["viewDirection"] = [0.0, 0.0, 1.0]

        if entity.dxf.hasattr("view_twist_angle"):
            props["geometry"]["twist"] = entity.dxf.view_twist_angle
        else:
            props["geometry"]["twist"] = 0.0

        if entity.dxf.hasattr("clipping_boundary_handle"):
            props["geometry"]["clipping"] = entity.dxf.clipping_boundary_handle
        else:
            props["geometry"]["clipping"] = 0

        if hasattr(entity, "frozen_layers"):
            props["geometry"]["frozenLayers"] = list(entity.frozen_layers)
        else:
            props["geometry"]["frozenLayers"] = []

        return props


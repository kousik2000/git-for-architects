import re
import os

filepath = r"e:\viewer_v2\arcos-cad\frontend\src\cad\renderer\CadRenderer.ts"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
imports = """import * as THREE from 'three';
import type { ArcosCadDocument, CadEntity, CadHatchEntity, CadInsertEntity, CadTextEntity, CadSplineEntity } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { getAciColor } from './AciPalette';
"""
code = re.sub(r"^import \* as THREE.*?\nimport type .*?\n", imports, code, flags=re.MULTILINE)

# 2. RenderContext
context_replacement = """interface RenderContext {
  lines: number[];
  colors: number[]; // Added for vertex colors
  hatchPositions: number[];
  hatchIndices: number[];
  hatchColors: number[]; // Added for hatch vertex colors
  hatchCurrentIndexOffset: number;
  
  stats: {
    totalLwpolylines: number;
    renderedLwpolylines: number;
    renderedHatches: number;
    hatchTriangles: number;
    renderedTexts: number;
    resolvedInserts: number;
    skippedInserts: number;
    renderedSplines: number;
    unsupportedSplines: number;
    splineSegments: number;
  };
}

interface InheritedStyle {
  color?: number;
  linetype?: string;
  lineweight?: number;
  ltscale?: number;
}
"""
code = code.replace("interface RenderContext {\n  lines: number[];", context_replacement.split("interface RenderContext {")[1])

# 3. Add helper methods to CadRenderer class
helpers = """
  private resolveColor(entity: CadEntity, doc: ArcosCadDocument, inherited: InheritedStyle): number {
    // 1. trueColor overrides all
    if (entity.style && entity.style.trueColor != null) {
      return entity.style.trueColor;
    }
    
    let aci = entity.style ? entity.style.color : 256; // 256 = BYLAYER
    
    // BYBLOCK
    if (aci === 0) {
      if (inherited.color != null) return inherited.color;
      return 0xffffff; // Default if no inherited
    }
    
    // BYLAYER
    if (aci === 256) {
      const layerName = entity.layer;
      const layer = doc.layers.find(l => l.name === layerName);
      if (layer) {
        if (layer.trueColor != null) return layer.trueColor;
        return getAciColor(layer.color);
      }
      return 0xffffff;
    }
    
    // Explicit ACI
    return getAciColor(aci);
  }

  private resolveLinetype(entity: CadEntity, doc: ArcosCadDocument, inherited: InheritedStyle): string | null {
    let lt = entity.style?.linetype;
    if (!lt || lt.toUpperCase() === 'BYLAYER') {
      const layer = doc.layers.find(l => l.name === entity.layer);
      lt = layer ? layer.linetype : null;
    } else if (lt.toUpperCase() === 'BYBLOCK') {
      lt = inherited.linetype || null;
    }
    return lt;
  }

  private addLineSegment(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, ltName: string | null, ltScale: number, doc: ArcosCadDocument, parentMatrix: THREE.Matrix4, context: RenderContext) {
    const vec3 = new THREE.Vector3();
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;

    const pattern = (ltName && doc.linetypes && doc.linetypes[ltName]) ? doc.linetypes[ltName].pattern : null;
    
    if (!pattern || pattern.length === 0) {
      vec3.set(x1, y1, z1).applyMatrix4(parentMatrix);
      context.lines.push(vec3.x, vec3.y, vec3.z);
      context.colors.push(r, g, b);
      
      vec3.set(x2, y2, z2).applyMatrix4(parentMatrix);
      context.lines.push(vec3.x, vec3.y, vec3.z);
      context.colors.push(r, g, b);
      return;
    }

    // Dashed line logic
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const totalLength = Math.hypot(dx, dy, dz);
    
    if (totalLength < 1e-6) return; // Too short to dash

    const dirX = dx / totalLength;
    const dirY = dy / totalLength;
    const dirZ = dz / totalLength;
    
    const globalLtScale = doc.units?.ltscale || 1.0;
    const finalScale = ltScale * globalLtScale;
    
    let currentPos = 0;
    let patIdx = 0;
    let drawing = true;

    while (currentPos < totalLength) {
      let dashLen = pattern[patIdx] * finalScale;
      
      if (dashLen === 0) {
        // Dot: draw a very tiny segment
        dashLen = 0.01 * finalScale;
        drawing = true;
      } else if (dashLen > 0) {
        // Dash
        drawing = true;
      } else {
        // Space
        dashLen = Math.abs(dashLen);
        drawing = false;
      }
      
      const nextPos = Math.min(currentPos + dashLen, totalLength);
      
      if (drawing) {
        const sx = x1 + dirX * currentPos;
        const sy = y1 + dirY * currentPos;
        const sz = z1 + dirZ * currentPos;
        
        const ex = x1 + dirX * nextPos;
        const ey = y1 + dirY * nextPos;
        const ez = z1 + dirZ * nextPos;
        
        vec3.set(sx, sy, sz).applyMatrix4(parentMatrix);
        context.lines.push(vec3.x, vec3.y, vec3.z);
        context.colors.push(r, g, b);
        
        vec3.set(ex, ey, ez).applyMatrix4(parentMatrix);
        context.lines.push(vec3.x, vec3.y, vec3.z);
        context.colors.push(r, g, b);
      }
      
      currentPos = nextPos;
      patIdx = (patIdx + 1) % pattern.length;
    }
  }
"""
code = code.replace("private generate2DPoints(", helpers + "\n  private generate2DPoints(")

# 4. Update buildGeometry initialization
build_geom_init = """    const context: RenderContext = {
      lines: [],
      colors: [],
      hatchPositions: [],
      hatchIndices: [],
      hatchColors: [],
      hatchCurrentIndexOffset: 0,"""
code = code.replace("    const context: RenderContext = {\n      lines: [],\n      hatchPositions: [],", build_geom_init)

# 5. Update buildGeometry flush lines (vertex colors)
flush_lines = """    // 1. Flush Batched Lines
    if (context.lines.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(context.lines, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(context.colors, 3));
      const material = new THREE.LineBasicMaterial({ vertexColors: true });
      const lineSegments = new THREE.LineSegments(geometry, material);
      lineSegments.renderOrder = 1; 
      this.scene.add(lineSegments);
    }"""
code = re.sub(r"// 1\. Flush Batched Lines.*?this\.scene\.add\(lineSegments\);\n    }", flush_lines, code, flags=re.DOTALL)

# 6. Update buildGeometry flush hatches (vertex colors)
flush_hatches = """    // 2. Flush Batched Hatches
    if (context.hatchPositions.length > 0) {
      const mergedGeom = new THREE.BufferGeometry();
      mergedGeom.setAttribute('position', new THREE.Float32BufferAttribute(context.hatchPositions, 3));
      mergedGeom.setAttribute('color', new THREE.Float32BufferAttribute(context.hatchColors, 3));
      mergedGeom.setIndex(context.hatchIndices);
      
      const hatchMaterial = new THREE.MeshBasicMaterial({ 
        vertexColors: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
      
      const hatchMesh = new THREE.Mesh(mergedGeom, hatchMaterial);
      hatchMesh.renderOrder = 0; 
      this.scene.add(hatchMesh);
    }"""
code = re.sub(r"// 2\. Flush Batched Hatches.*?this\.scene\.add\(hatchMesh\);\n    }", flush_hatches, code, flags=re.DOTALL)

# 7. Update processEntities signature and add style resolution
process_sig = """  private processEntities(
    entities: CadEntity[], 
    parentMatrix: THREE.Matrix4, 
    doc: ArcosCadDocument, 
    depth: number, 
    context: RenderContext,
    inherited: InheritedStyle = {}
  ) {"""
code = code.replace("  private processEntities(\n    entities: CadEntity[], \n    parentMatrix: THREE.Matrix4, \n    doc: ArcosCadDocument, \n    depth: number, \n    context: RenderContext\n  ) {", process_sig)

# We need to replace all context.lines.push(...) inside processEntities with this.addLineSegment(...)
# This is tricky with regex, let's write a python function to replace the entity processors block by block.

import_re = r"(for \(const entity of entities\) \{)(.*?)(^\s*\}\s*^\s*\}) "
# Actually, let's just do targeted replacements inside the loop

loop_header = """for (const entity of entities) {
      const color = this.resolveColor(entity, doc, inherited);
      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8) & 255) / 255;
      const b = (color & 255) / 255;
      const ltName = this.resolveLinetype(entity, doc, inherited);
      const ltScale = (entity.style?.ltscale || 1.0) * (inherited.ltscale || 1.0);
"""
code = code.replace("for (const entity of entities) {", loop_header)

# LINE
line_block = """      if (entity.type === 'LINE') {
        const lineEntity = entity as any;
        this.addLineSegment(
          lineEntity.geometry.start[0], lineEntity.geometry.start[1], lineEntity.geometry.start[2] || 0,
          lineEntity.geometry.end[0], lineEntity.geometry.end[1], lineEntity.geometry.end[2] || 0,
          color, ltName, ltScale, doc, parentMatrix, context
        );
      }"""
code = re.sub(r"if \(entity\.type === 'LINE'\) \{.*?\} \n\s*else if \(entity\.type === 'LWPOLYLINE'\)", line_block + "\n      else if (entity.type === 'LWPOLYLINE')", code, flags=re.DOTALL)

# LWPOLYLINE replacements for addLineSegment
# Replace vec3.set(x1, y1, z1).applyMatrix4(parentMatrix);\n            context.lines.push(vec3.x, vec3.y, vec3.z);\n            vec3.set(x2, y2, z2).applyMatrix4(parentMatrix);\n            context.lines.push(vec3.x, vec3.y, vec3.z);
code = code.replace("""vec3.set(x1, y1, z1).applyMatrix4(parentMatrix);
            context.lines.push(vec3.x, vec3.y, vec3.z);
            vec3.set(x2, y2, z2).applyMatrix4(parentMatrix);
            context.lines.push(vec3.x, vec3.y, vec3.z);""", """this.addLineSegment(x1, y1, z1, x2, y2, z2, color, ltName, ltScale, doc, parentMatrix, context);""")

# For the arcs in LWPOLYLINE
code = code.replace("""vec3.set(prevX, prevY, prevZ).applyMatrix4(parentMatrix);
              context.lines.push(vec3.x, vec3.y, vec3.z);
              
              vec3.set(currX, currY, currZ).applyMatrix4(parentMatrix);
              context.lines.push(vec3.x, vec3.y, vec3.z);""", """this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context);""")

# HATCH color logic
hatch_push_positions = """for (let i = 0; i < pos.count; i++) {
              context.hatchPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
              context.hatchColors.push(r, g, b);
            }"""
code = code.replace("""for (let i = 0; i < pos.count; i++) {
              context.hatchPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
            }""", hatch_push_positions)

# TEXT logic
text_block = """      else if (entity.type === 'TEXT') {
        const textEntity = entity as CadTextEntity;
        if (!textEntity.text || !textEntity.geometry?.location) continue;
        
        const mesh = this.createTextMesh(textEntity);
        if (mesh) {
          // Apply color (tinting the material)
          (mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
          
          mesh.position.set(
            textEntity.geometry.location[0],
            textEntity.geometry.location[1],
            textEntity.geometry.location[2] || 0
          );
          
          // Apply CAD rotation
          if (textEntity.geometry.rotation) {
             mesh.rotation.z = THREE.MathUtils.degToRad(textEntity.geometry.rotation);
          }
          
          mesh.updateMatrix();
          mesh.applyMatrix4(parentMatrix);
          mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
          
          mesh.renderOrder = 2;
          this.scene.add(mesh);
          context.stats.renderedTexts++;
        }
      }"""
code = re.sub(r"else if \(entity\.type === 'TEXT'\) \{.*?(?=else if \(entity\.type === 'INSERT'\))", text_block + "\n      ", code, flags=re.DOTALL)

# INSERT inheritance
insert_block = """this.processEntities(block.entities, finalMatrix, doc, depth + 1, context, {
          color: color,
          linetype: ltName || undefined,
          ltscale: ltScale
        });"""
code = code.replace("this.processEntities(block.entities, finalMatrix, doc, depth + 1, context);", insert_block)

# SPLINE logic
spline_block = """        for (let j = 0; j < points.length - 1; j++) {
          this.addLineSegment(
            points[j].x, points[j].y, points[j].z,
            points[j+1].x, points[j+1].y, points[j+1].z,
            color, ltName, ltScale, doc, parentMatrix, context
          );
        }"""
code = re.sub(r"for \(let j = 0; j < points\.length - 1; j\+\+\) \{.*?\}", spline_block, code, flags=re.DOTALL)

# createTextMesh method signature
code = code.replace("private createTextMesh(text: string): THREE.Mesh | null {", "private createTextMesh(textEntity: CadTextEntity): THREE.Mesh | null {")
code = code.replace("const text = textEntity.text;", "") # in case
code = code.replace("const defaultCadHeight = 4.0;", """const text = textEntity.text;
    const defaultCadHeight = textEntity.geometry.height || 4.0;
    const halign = textEntity.geometry.halign || 0;
    const valign = textEntity.geometry.valign || 0;""")
    
code = code.replace("ctx.textBaseline = 'top';", """// Handle vertical alignment mapping roughly
    if (valign === 0) { ctx.textBaseline = 'alphabetic'; }
    else if (valign === 1) { ctx.textBaseline = 'bottom'; }
    else if (valign === 2) { ctx.textBaseline = 'middle'; }
    else if (valign === 3) { ctx.textBaseline = 'top'; }
    else { ctx.textBaseline = 'alphabetic'; }
    
    // Handle horizontal alignment
    if (halign === 0 || halign === 3 || halign === 5) { ctx.textAlign = 'left'; }
    else if (halign === 1 || halign === 4) { ctx.textAlign = 'center'; }
    else if (halign === 2) { ctx.textAlign = 'right'; }
    else { ctx.textAlign = 'left'; }
    
    // Position text on canvas according to alignment
    let drawX = 2;
    if (ctx.textAlign === 'center') drawX = canvas.width / 2;
    if (ctx.textAlign === 'right') drawX = canvas.width - 2;
    
    let drawY = canvas.height - 6; // roughly alphabetic baseline
    if (ctx.textBaseline === 'top') drawY = 2;
    if (ctx.textBaseline === 'middle') drawY = canvas.height / 2;
    if (ctx.textBaseline === 'bottom') drawY = canvas.height - 2;
    """)
    
code = code.replace("ctx.fillText(text, 2, 2);", "ctx.fillText(text, drawX, drawY);")

# Update alignment of the PlaneGeometry to respect alignment
plane_translate = """    let transX = planeWidth / 2;
    let transY = planeHeight / 2;
    
    // Adjust based on halign (0=Left, 1=Center, 2=Right)
    if (halign === 1 || halign === 4) transX = 0; // centered
    if (halign === 2) transX = -planeWidth / 2; // right aligned
    
    // Adjust based on valign (0=Baseline, 1=Bottom, 2=Middle, 3=Top)
    if (valign === 1) transY = planeHeight;
    if (valign === 2) transY = 0; // centered
    if (valign === 3) transY = -planeHeight / 2; // top aligned

    geometry.translate(transX, transY, 0);"""
code = code.replace("geometry.translate(planeWidth / 2, planeHeight / 2, 0);", plane_translate)


# Permission checks
code = code.replace("private handleWheel = (e: WheelEvent) => {", """private handleWheel = (e: WheelEvent) => {
    if (!hasPermission(PERMISSIONS.CAD_ZOOM)) return;""")
    
code = code.replace("private handlePointerMove = (e: PointerEvent) => {", """private handlePointerMove = (e: PointerEvent) => {
    if (!hasPermission(PERMISSIONS.CAD_PAN)) return;""")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)
print("Updated successfully")

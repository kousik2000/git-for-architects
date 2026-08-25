import re

filepath = r"e:\viewer_v2\arcos-cad\frontend\src\cad\renderer\CadRenderer.ts"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# 1. Update InheritedStyle to include layer
code = code.replace(
    "interface InheritedStyle {\n  color?: number;",
    "interface InheritedStyle {\n  layer?: string;\n  color?: number;"
)

# 2. Add layerGroups to CadRenderer class
code = code.replace(
    "private animationFrameId: number | null = null;",
    "private animationFrameId: number | null = null;\n  private layerGroups = new Map<string, THREE.Group>();"
)

# 3. Add setLayerVisibility method
visibility_method = """
  public setLayerVisibility(layerName: string, visible: boolean) {
    const group = this.layerGroups.get(layerName);
    if (group) {
      group.visible = visible;
      this.renderer.render(this.scene, this.camera); // re-render on change
    }
  }
"""
code = code.replace("public loadDocument(", visibility_method + "\n  public loadDocument(")

# 4. Modify buildGeometry to use Map<string, RenderContext>
# We need to replace the context initialization and flushing.
# The original code has `const context: RenderContext = { ... }` inside buildGeometry.
# We'll replace it with a getContext(layerName) function and loop over them.

build_geom_start = """
    const layerContexts = new Map<string, RenderContext>();
    this.layerGroups.clear();
    
    const getContext = (layer: string) => {
      if (!layerContexts.has(layer)) {
        layerContexts.set(layer, {
          lines: [], colors: [],
          hatchPositions: [], hatchIndices: [], hatchColors: [], hatchCurrentIndexOffset: 0,
          stats: {
            totalLwpolylines: 0, renderedLwpolylines: 0, renderedHatches: 0,
            hatchTriangles: 0, renderedTexts: 0, resolvedInserts: 0,
            skippedInserts: 0, renderedSplines: 0, unsupportedSplines: 0, splineSegments: 0
          }
        });
      }
      return layerContexts.get(layer)!;
    };

    // We need an aggregated stats object for the console log
    const aggregatedStats = {
      totalLwpolylines: 0, renderedLwpolylines: 0, renderedHatches: 0,
      hatchTriangles: 0, renderedTexts: 0, resolvedInserts: 0,
      skippedInserts: 0, renderedSplines: 0, unsupportedSplines: 0, splineSegments: 0
    };
"""

# Let's replace from `const context: RenderContext = {` up to `};`
# Since it's a bit hard to target exactly, I'll use regex.
code = re.sub(
    r"const context: RenderContext = \{.*?splineSegments: 0\n\s*\};\n\s*\}?;",
    build_geom_start,
    code,
    flags=re.DOTALL
)

# Update the call to processEntities to pass `layerContexts` and a `getContext` closure?
# Wait, `processEntities` expects a single `context`. I'll pass `getContext` and `aggregatedStats` instead.
# Let's change `processEntities` signature.
process_entities_sig_old = """private processEntities(
    entities: CadEntity[], 
    parentMatrix: THREE.Matrix4, 
    doc: ArcosCadDocument, 
    depth: number, 
    context: RenderContext,
    inherited: InheritedStyle = {}
  )"""
process_entities_sig_new = """private processEntities(
    entities: CadEntity[], 
    parentMatrix: THREE.Matrix4, 
    doc: ArcosCadDocument, 
    depth: number, 
    getContext: (layer: string) => RenderContext,
    aggregatedStats: any,
    inherited: InheritedStyle = {}
  )"""
code = code.replace(process_entities_sig_old, process_entities_sig_new)

# Inside buildGeometry:
code = code.replace(
    "this.processEntities(doc.entities, identityMatrix, doc, 0, context);",
    "this.processEntities(doc.entities, identityMatrix, doc, 0, getContext, aggregatedStats);"
)

# Inside processEntities block recursive call
code = code.replace(
    "this.processEntities(block.entities, finalMatrix, doc, depth + 1, context, {",
    "this.processEntities(block.entities, finalMatrix, doc, depth + 1, getContext, aggregatedStats, {"
)

# Inside processEntities loop, we need to resolve the effective layer and get `context`
loop_header_old = """for (const entity of entities) {
      const color = this.resolveColor(entity, doc, inherited);"""
loop_header_new = """for (const entity of entities) {
      const effectiveLayer = (entity.layer === '0' && inherited.layer) ? inherited.layer : entity.layer;
      const context = getContext(effectiveLayer);
      
      const color = this.resolveColor(entity, doc, inherited);"""
code = code.replace(loop_header_old, loop_header_new)

# Replace stats increments inside processEntities
code = code.replace("context.stats.", "aggregatedStats.")

# Flushing batches in buildGeometry
flush_logic_old_pattern = r"// 1\. Flush Batched Lines.*?this\.scene\.add\(hatchMesh\);\n\s*\}"
flush_logic_new = """// Flush Batched Geometries Per Layer
    let totalLineVertices = 0;
    let totalHatchVertices = 0;

    layerContexts.forEach((ctx, layerName) => {
      const group = new THREE.Group();
      group.name = `layer_${layerName}`;
      
      // Determine initial visibility from CAD JSON
      const docLayer = doc.layers.find(l => l.name === layerName);
      if (docLayer) {
        if (!docLayer.visible || docLayer.frozen) {
          group.visible = false;
        }
      }

      if (ctx.lines.length > 0) {
        totalLineVertices += ctx.lines.length / 3;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(ctx.lines, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(ctx.colors, 3));
        const material = new THREE.LineBasicMaterial({ vertexColors: true });
        const lineSegments = new THREE.LineSegments(geometry, material);
        lineSegments.renderOrder = 1; 
        group.add(lineSegments);
      }

      if (ctx.hatchPositions.length > 0) {
        totalHatchVertices += ctx.hatchPositions.length / 3;
        const mergedGeom = new THREE.BufferGeometry();
        mergedGeom.setAttribute('position', new THREE.Float32BufferAttribute(ctx.hatchPositions, 3));
        mergedGeom.setAttribute('color', new THREE.Float32BufferAttribute(ctx.hatchColors, 3));
        mergedGeom.setIndex(ctx.hatchIndices);
        
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
        group.add(hatchMesh);
      }
      
      // Add text meshes stored in ctx? Wait, texts are currently added directly to scene!
      // We should add texts to the group instead.
      
      this.scene.add(group);
      this.layerGroups.set(layerName, group);
    });
"""
code = re.sub(flush_logic_old_pattern, flush_logic_new, code, flags=re.DOTALL)

# Handle TEXT adding to scene. It is currently `this.scene.add(mesh);` inside `processEntities`.
# We need to change that to `this.layerGroups.get(effectiveLayer).add(mesh)`? But layerGroups are created AFTER processing!
# To fix this, we can store text meshes in the context during processing.
# Let's add `textMeshes: THREE.Mesh[]` to `RenderContext` and `RenderContext` init.
code = code.replace(
    "hatchColors: number[]; // Added for hatch vertex colors\n  hatchCurrentIndexOffset: number;",
    "hatchColors: number[]; // Added for hatch vertex colors\n  hatchCurrentIndexOffset: number;\n  textMeshes: THREE.Mesh[];"
)
code = code.replace(
    "hatchPositions: [], hatchIndices: [], hatchColors: [], hatchCurrentIndexOffset: 0,",
    "hatchPositions: [], hatchIndices: [], hatchColors: [], hatchCurrentIndexOffset: 0, textMeshes: [],"
)

# And in processEntities, change `this.scene.add(mesh);` to `context.textMeshes.push(mesh);`
code = code.replace(
    "mesh.renderOrder = 2;\n          this.scene.add(mesh);\n          aggregatedStats.renderedTexts++;",
    "mesh.renderOrder = 2;\n          context.textMeshes.push(mesh);\n          aggregatedStats.renderedTexts++;"
)

# And in flush_logic_new, add text meshes to the group
code = code.replace(
    "      this.scene.add(group);\n      this.layerGroups.set(layerName, group);",
    "      ctx.textMeshes.forEach(mesh => group.add(mesh));\n      this.scene.add(group);\n      this.layerGroups.set(layerName, group);"
)

# Update the log stats in buildGeometry
code = code.replace("context.stats.renderedLwpolylines", "aggregatedStats.renderedLwpolylines")
code = code.replace("context.stats.renderedHatches", "aggregatedStats.renderedHatches")
code = code.replace("context.stats.hatchTriangles", "aggregatedStats.hatchTriangles")
code = code.replace("context.stats.renderedTexts", "aggregatedStats.renderedTexts")
code = code.replace("context.stats.resolvedInserts", "aggregatedStats.resolvedInserts")
code = code.replace("context.stats.skippedInserts", "aggregatedStats.skippedInserts")
code = code.replace("context.stats.renderedSplines", "aggregatedStats.renderedSplines")
code = code.replace("context.stats.splineSegments", "aggregatedStats.splineSegments")
code = code.replace("context.stats.unsupportedSplines", "aggregatedStats.unsupportedSplines")
code = code.replace("context.lines.length / 3", "totalLineVertices")
code = code.replace("context.hatchPositions.length / 3", "totalHatchVertices")

# Ensure inherited layer is passed
code = code.replace(
    "color: color,\n          linetype: ltName || undefined,\n          ltscale: ltScale",
    "layer: effectiveLayer,\n          color: color,\n          linetype: ltName || undefined,\n          ltscale: ltScale"
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("Rewrite complete")

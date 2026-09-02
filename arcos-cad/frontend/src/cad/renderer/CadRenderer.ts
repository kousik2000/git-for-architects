import * as THREE from 'three';
import type { ArcosCadDocument, CadEntity, CadHatchEntity, CadInsertEntity, CadTextEntity, CadSplineEntity } from '../../types/cad-json';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { getAciColor } from './AciPalette';

interface PathInfo {
  points: THREE.Vector2[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

interface RenderContext {
  lines: number[];
  colors: number[]; // Added for vertex colors
  hatchPositions: number[];
  hatchIndices: number[];
  hatchColors: number[]; // Added for hatch vertex colors
  hatchCurrentIndexOffset: number;
  textMeshes: THREE.Mesh[];
  
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
    renderedCircles: number;
    renderedArcs: number;
    renderedEllipses: number;
    renderedPoints: number;
    renderedDimensions: number;
    renderedLeaders: number;
    renderedMLeaders: number;
    renderedArcDimensions: number;
    renderedMTexts: number;
  };
}

interface InheritedStyle {
  layer?: string;
  color?: number;
  linetype?: string;
  lineweight?: number;
  ltscale?: number;
}

export class CadRenderer {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private layerGroups = new Map<string, THREE.Group>();
  private isDisposed = false;

  private docBoundsMin: [number, number, number] | null = null;
  private docBoundsMax: [number, number, number] | null = null;
  private activeDoc: ArcosCadDocument | null = null;

  private isDragging = false;
  private previousPointerPosition = { x: 0, y: 0 };
  private baseUnitsPerPixel = 1;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x1e1e1e, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1000);
    this.camera.position.z = 10;

    this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    this.container.addEventListener('pointerdown', this.handlePointerDown);
    this.container.addEventListener('pointermove', this.handlePointerMove);
    this.container.addEventListener('pointerup', this.handlePointerUp);
    this.container.addEventListener('pointercancel', this.handlePointerUp);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.animate();
  }

  
  public setLayerVisibility(layerName: string, visible: boolean) {
    const group = this.layerGroups.get(layerName);
    if (group) {
      group.visible = visible;
      this.renderer.render(this.scene, this.camera); // re-render on change
    }
  }

  public loadDocument(doc: ArcosCadDocument) {
    if (this.isDisposed) return;
    this.activeDoc = doc;
    this.docBoundsMin = doc.bounds.min;
    this.docBoundsMax = doc.bounds.max;
    this.renderSpace('model');
  }

  public renderSpace(spaceType: 'model' | 'layout', layoutName?: string) {
    if (!this.activeDoc) return;
    this.clearScene();
    
    let entitiesToRender: CadEntity[] = [];
    if (spaceType === 'model') {
      entitiesToRender = this.activeDoc.entities;
    } else if (spaceType === 'layout' && layoutName) {
      const layout = this.activeDoc.layouts[layoutName];
      if (layout) {
        entitiesToRender = layout.entities;
      }
    }
    
    const startTime = performance.now();
    this.buildGeometry(entitiesToRender, this.activeDoc);
    const endTime = performance.now();
    
    console.log(`[CadRenderer] renderSpace(${spaceType}, ${layoutName || ''}) time: ${(endTime - startTime).toFixed(2)}ms`);
    
    // Fallback to document bounds
    this.fitToDrawing();
  }

  
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

  private generate2DPoints(vertices: any[], isClosed: boolean | number, bulgeIndex: number): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    if (!vertices || vertices.length < 2) return points;

    const numSegments = isClosed ? vertices.length : vertices.length - 1;
    
    for (let i = 0; i < numSegments; i++) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % vertices.length];
      
      const x1 = v1[0], y1 = v1[1], b = v1[bulgeIndex] || 0.0;
      const x2 = v2[0], y2 = v2[1];

      if (i === 0) {
        points.push(new THREE.Vector2(x1, y1));
      }

      if (Math.abs(b) < 1e-6) {
        points.push(new THREE.Vector2(x2, y2));
      } else {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const c = (1 - b * b) / (2 * b);
        const cx = (x1 + x2) / 2 - c * dy / 2;
        const cy = (y1 + y2) / 2 + c * dx / 2;
        
        const R = Math.hypot(x1 - cx, y1 - cy);
        let startAngle = Math.atan2(y1 - cy, x1 - cx);
        let endAngle = Math.atan2(y2 - cy, x2 - cx);
        
        if (b > 0 && endAngle <= startAngle) endAngle += Math.PI * 2;
        else if (b < 0 && endAngle >= startAngle) endAngle -= Math.PI * 2;
        
        const angleDiff = Math.abs(endAngle - startAngle);
        const segments = Math.max(8, Math.min(128, Math.ceil(angleDiff * 15)));
        const step = (endAngle - startAngle) / segments;
        
        for (let j = 1; j <= segments; j++) {
          const isLast = j === segments;
          const currentAngle = startAngle + step * j;
          const currX = isLast ? x2 : cx + R * Math.cos(currentAngle);
          const currY = isLast ? y2 : cy + R * Math.sin(currentAngle);
          points.push(new THREE.Vector2(currX, currY));
        }
      }
    }
    return points;
  }

  private buildGeometry(entities: CadEntity[], doc: ArcosCadDocument) {
    const layerContexts = new Map<string, RenderContext>();
    this.layerGroups.clear();
    
    const getContext = (layer: string) => {
      if (!layerContexts.has(layer)) {
        layerContexts.set(layer, {
          lines: [], colors: [],
          hatchPositions: [], hatchIndices: [], hatchColors: [], hatchCurrentIndexOffset: 0, textMeshes: [],
          stats: {
            totalLwpolylines: 0, renderedLwpolylines: 0, renderedHatches: 0,
            hatchTriangles: 0, renderedTexts: 0, resolvedInserts: 0,
            skippedInserts: 0, renderedSplines: 0, unsupportedSplines: 0, splineSegments: 0, renderedCircles: 0, renderedArcs: 0, renderedEllipses: 0, renderedPoints: 0,
            renderedDimensions: 0, renderedLeaders: 0, renderedMLeaders: 0, renderedArcDimensions: 0, renderedMTexts: 0
          }
        });
      }
      return layerContexts.get(layer)!;
    };

    const aggregatedStats = {
      totalLwpolylines: 0, renderedLwpolylines: 0, renderedHatches: 0,
      hatchTriangles: 0, renderedTexts: 0, resolvedInserts: 0,
      skippedInserts: 0, renderedSplines: 0, unsupportedSplines: 0, splineSegments: 0, renderedCircles: 0, renderedArcs: 0, renderedEllipses: 0, renderedPoints: 0,
      renderedDimensions: 0, renderedLeaders: 0, renderedMLeaders: 0, renderedArcDimensions: 0, renderedMTexts: 0
    };

    const identityMatrix = new THREE.Matrix4();
    
    const geomStart = performance.now();
    this.processEntities(entities, identityMatrix, doc, 0, getContext, aggregatedStats);
    const geomEnd = performance.now();
    console.log(`[CadRenderer] Geometry loop time: ${(geomEnd - geomStart).toFixed(2)}ms`);

        // Flush Batched Geometries Per Layer
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
      
      ctx.textMeshes.forEach(mesh => group.add(mesh));
      this.scene.add(group);
      this.layerGroups.set(layerName, group);
    });


    console.log(`
--- PHASE 5.8 RENDER STATISTICS ---
LWPOLYLINE Processed: ${aggregatedStats.renderedLwpolylines}
HATCH Processed: ${aggregatedStats.renderedHatches}
HATCH Triangles: ${Math.floor(aggregatedStats.hatchTriangles)}
TEXT Processed: ${aggregatedStats.renderedTexts}
MTEXT Processed: ${aggregatedStats.renderedMTexts}
INSERT Resolved: ${aggregatedStats.resolvedInserts}
INSERT Skipped: ${aggregatedStats.skippedInserts}
SPLINE Processed: ${aggregatedStats.renderedSplines}
SPLINE Segments: ${aggregatedStats.splineSegments}
Unsupported SPLINEs: ${aggregatedStats.unsupportedSplines}
CIRCLE Processed: ${aggregatedStats.renderedCircles}
ARC Processed: ${aggregatedStats.renderedArcs}
ELLIPSE Processed: ${aggregatedStats.renderedEllipses}
POINT Processed: ${aggregatedStats.renderedPoints}
DIMENSION Processed: ${aggregatedStats.renderedDimensions}
LEADER Processed: ${aggregatedStats.renderedLeaders}
MLEADER Processed: ${aggregatedStats.renderedMLeaders}
ARC_DIMENSION Processed: ${aggregatedStats.renderedArcDimensions}
Batched Line Vertices: ${totalLineVertices}
Batched Hatch Vertices: ${totalHatchVertices}
    `);
  }

  private processEntities(
    entities: CadEntity[], 
    parentMatrix: THREE.Matrix4, 
    doc: ArcosCadDocument, 
    depth: number, 
    getContext: (layer: string) => RenderContext,
    aggregatedStats: any,
    inherited: InheritedStyle = {}
  ) {
    if (depth > 20) {
      console.warn('Max block nesting depth exceeded.');
      return;
    }



    for (const entity of entities) {
      const effectiveLayer = (entity.layer === '0' && inherited.layer) ? inherited.layer : entity.layer;
      const context = getContext(effectiveLayer);
      
      const color = this.resolveColor(entity, doc, inherited);
      const r = ((color >> 16) & 255) / 255;
      const g = ((color >> 8) & 255) / 255;
      const b = (color & 255) / 255;
      const ltName = this.resolveLinetype(entity, doc, inherited);
      const ltScale = (entity.style?.ltscale || 1.0) * (inherited.ltscale || 1.0);

            if (entity.type === 'LINE') {
        const lineEntity = entity as any;
        this.addLineSegment(
          lineEntity.geometry.start[0], lineEntity.geometry.start[1], lineEntity.geometry.start[2] || 0,
          lineEntity.geometry.end[0], lineEntity.geometry.end[1], lineEntity.geometry.end[2] || 0,
          color, ltName, ltScale, doc, parentMatrix, context
        );
      }
      else if (entity.type === 'LWPOLYLINE') {
        aggregatedStats.totalLwpolylines++;
        const geometry = (entity as any).geometry;
        const vertices = geometry.vertices;
        if (!vertices || vertices.length < 2) continue;
        
        aggregatedStats.renderedLwpolylines++;
        const numSegments = geometry.closed ? vertices.length : vertices.length - 1;
        
        for (let i = 0; i < numSegments; i++) {
          const v1 = vertices[i];
          const v2 = vertices[(i + 1) % vertices.length];
          
          const x1 = v1[0], y1 = v1[1], z1 = v1[2] || 0, b = v1[3] || 0.0;
          const x2 = v2[0], y2 = v2[1], z2 = v2[2] || 0;

          if (Math.abs(x2 - x1) < 1e-10 && Math.abs(y2 - y1) < 1e-10) continue;

          if (Math.abs(b) < 1e-6) {
            this.addLineSegment(x1, y1, z1, x2, y2, z2, color, ltName, ltScale, doc, parentMatrix, context);
          } else {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const c = (1 - b * b) / (2 * b);
            const cx = (x1 + x2) / 2 - c * dy / 2;
            const cy = (y1 + y2) / 2 + c * dx / 2;
            
            const R = Math.hypot(x1 - cx, y1 - cy);
            let startAngle = Math.atan2(y1 - cy, x1 - cx);
            let endAngle = Math.atan2(y2 - cy, x2 - cx);
            
            if (b > 0 && endAngle <= startAngle) endAngle += Math.PI * 2;
            else if (b < 0 && endAngle >= startAngle) endAngle -= Math.PI * 2;
            
            const angleDiff = Math.abs(endAngle - startAngle);
            const segments = Math.max(8, Math.min(128, Math.ceil(angleDiff * 15)));
            const step = (endAngle - startAngle) / segments;
            
            let prevX = x1, prevY = y1, prevZ = z1;
            
            for (let j = 1; j <= segments; j++) {
              const isLast = j === segments;
              const currentAngle = startAngle + step * j;
              const currX = isLast ? x2 : cx + R * Math.cos(currentAngle);
              const currY = isLast ? y2 : cy + R * Math.sin(currentAngle);
              const currZ = isLast ? z2 : z1 + (z2 - z1) * (j / segments);
              
              this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context);
              
              prevX = currX; prevY = currY; prevZ = currZ;
            }
          }
        }
      } 
      
      else if (entity.type === 'CIRCLE') {
        aggregatedStats.renderedCircles++;
        const circle = entity as any;
        const cx = circle.geometry.center[0];
        const cy = circle.geometry.center[1];
        const cz = circle.geometry.center[2] || 0;
        const R = circle.geometry.radius;
        const segments = 64; // DEFAULT_CURVE_SEGMENTS
        const step = (Math.PI * 2) / segments;
        
        let prevX = cx + R;
        let prevY = cy;
        let prevZ = cz;
        
        for (let j = 1; j <= segments; j++) {
          const currentAngle = step * j;
          const currX = cx + R * Math.cos(currentAngle);
          const currY = cy + R * Math.sin(currentAngle);
          const currZ = cz;
          
          this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context);
          
          prevX = currX; prevY = currY; prevZ = currZ;
        }
      }
      else if (entity.type === 'ARC') {
        aggregatedStats.renderedArcs++;
        const arc = entity as any;
        const cx = arc.geometry.center[0];
        const cy = arc.geometry.center[1];
        const cz = arc.geometry.center[2] || 0;
        const R = arc.geometry.radius;
        let startAngle = arc.geometry.startAngle;
        let endAngle = arc.geometry.endAngle;
        
        // Convert to radians if they are in degrees (ezdxf usually gives degrees for arcs, wait: ezdxf arcs are in degrees)
        // Let's check dummy json: startAngle is e.g., 270, 90. They are degrees!
        startAngle = startAngle * Math.PI / 180;
        endAngle = endAngle * Math.PI / 180;
        
        let angleDiff = endAngle - startAngle;
        if (angleDiff < 0) angleDiff += Math.PI * 2;
        
        const DEFAULT_CURVE_SEGMENTS = 64;
        const segments = Math.max(8, Math.min(128, Math.ceil(DEFAULT_CURVE_SEGMENTS * Math.abs(angleDiff) / (Math.PI * 2))));
        const step = angleDiff / segments;
        
        let prevX = cx + R * Math.cos(startAngle);
        let prevY = cy + R * Math.sin(startAngle);
        let prevZ = cz;
        
        for (let j = 1; j <= segments; j++) {
          const currentAngle = startAngle + step * j;
          const currX = cx + R * Math.cos(currentAngle);
          const currY = cy + R * Math.sin(currentAngle);
          const currZ = cz;
          
          this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context);
          
          prevX = currX; prevY = currY; prevZ = currZ;
        }
      }
      else if (entity.type === 'ELLIPSE') {
        aggregatedStats.renderedEllipses++;
        const ellipse = entity as any;
        const cx = ellipse.geometry.center[0];
        const cy = ellipse.geometry.center[1];
        const cz = ellipse.geometry.center[2] || 0;
        const mx = ellipse.geometry.majorAxis[0];
        const my = ellipse.geometry.majorAxis[1];
        const mz = ellipse.geometry.majorAxis[2] || 0;
        const ratio = ellipse.geometry.ratio;
        const startParam = ellipse.geometry.startParam; // in radians for ellipse in dxf
        const endParam = ellipse.geometry.endParam;
        
        const majorLen = Math.hypot(mx, my, mz);
        const minorLen = majorLen * ratio;
        
        // The major axis vector defines the rotation of the ellipse
        const angle = Math.atan2(my, mx);
        
        let angleDiff = endParam - startParam;
        if (angleDiff < 0) angleDiff += Math.PI * 2;
        
        const DEFAULT_CURVE_SEGMENTS = 64;
        const segments = Math.max(8, Math.min(128, Math.ceil(DEFAULT_CURVE_SEGMENTS * Math.abs(angleDiff) / (Math.PI * 2))));
        const step = angleDiff / segments;
        
        let prevX = 0, prevY = 0, prevZ = cz;
        for (let j = 0; j <= segments; j++) {
          const t = startParam + step * j;
          // Parametric equation for ellipse before rotation
          const ex = majorLen * Math.cos(t);
          const ey = minorLen * Math.sin(t);
          
          // Rotate by 'angle' and translate
          const currX = cx + ex * Math.cos(angle) - ey * Math.sin(angle);
          const currY = cy + ex * Math.sin(angle) + ey * Math.cos(angle);
          const currZ = cz;
          
          if (j > 0) {
            this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context);
          }
          
          prevX = currX; prevY = currY; prevZ = currZ;
        }
      }
      else if (entity.type === 'POINT') {
        aggregatedStats.renderedPoints++;
        const pt = entity as any;
        const px = pt.geometry.location[0];
        const py = pt.geometry.location[1];
        const pz = pt.geometry.location[2] || 0;
        // Render a very small cross for the point to be visible
        const d = 0.5;
        this.addLineSegment(px - d, py, pz, px + d, py, pz, color, ltName, ltScale, doc, parentMatrix, context);
        this.addLineSegment(px, py - d, pz, px, py + d, pz, color, ltName, ltScale, doc, parentMatrix, context);
      }

      else if (entity.type === 'HATCH') {
        const hatch = entity as CadHatchEntity;
        if (!hatch.geometry.boundaryPaths || hatch.geometry.boundaryPaths.length === 0) continue;
        if (!hatch.geometry.solidFill) continue;

        aggregatedStats.renderedHatches++;
        const pathInfos: PathInfo[] = [];

        for (const path of hatch.geometry.boundaryPaths) {
          let pts: THREE.Vector2[] = [];
          if (path.type === 'PolylinePath') {
            pts = this.generate2DPoints(path.vertices, path.isClosed, 2);
          } else if (path.type === 'EdgePath') {
            for (const edge of path.edges) {
              if (edge.type === 'LineEdge') {
                if (pts.length === 0) pts.push(new THREE.Vector2(edge.start[0], edge.start[1]));
                pts.push(new THREE.Vector2(edge.end[0], edge.end[1]));
              }
            }
          }

          if (pts.length < 3) continue;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }
          pathInfos.push({ points: pts, bounds: { minX, minY, maxX, maxY } });
        }

        if (pathInfos.length === 0) continue;

        const outerPaths: PathInfo[] = [];
        const holePaths: PathInfo[] = [];

        for (let i = 0; i < pathInfos.length; i++) {
          const pi = pathInfos[i];
          let isHole = false;
          for (let j = 0; j < pathInfos.length; j++) {
            if (i === j) continue;
            const pj = pathInfos[j];
            const eps = 1e-6;
            if (
              pi.bounds.minX >= pj.bounds.minX - eps && pi.bounds.maxX <= pj.bounds.maxX + eps &&
              pi.bounds.minY >= pj.bounds.minY - eps && pi.bounds.maxY <= pj.bounds.maxY + eps
            ) {
              const areaI = (pi.bounds.maxX - pi.bounds.minX) * (pi.bounds.maxY - pi.bounds.minY);
              const areaJ = (pj.bounds.maxX - pj.bounds.minX) * (pj.bounds.maxY - pj.bounds.minY);
              if (areaI < areaJ - eps) {
                isHole = true;
                break;
              }
            }
          }
          if (isHole) holePaths.push(pi);
          else outerPaths.push(pi);
        }

        if (outerPaths.length === 0 && holePaths.length > 0) {
          outerPaths.push(holePaths[0]);
          holePaths.shift();
        }

        const shapes: THREE.Shape[] = [];
        for (const out of outerPaths) shapes.push(new THREE.Shape(out.points));

        for (const hole of holePaths) {
          const holePath = new THREE.Path(hole.points);
          if (shapes.length === 1) {
            shapes[0].holes.push(holePath);
          } else {
            let assigned = false;
            for (let i = 0; i < shapes.length; i++) {
              const outBounds = outerPaths[i].bounds;
              if (
                hole.bounds.minX >= outBounds.minX && hole.bounds.maxX <= outBounds.maxX &&
                hole.bounds.minY >= outBounds.minY && hole.bounds.maxY <= outBounds.maxY
              ) {
                shapes[i].holes.push(holePath);
                assigned = true;
                break;
              }
            }
            if (!assigned && shapes.length > 0) shapes[shapes.length - 1].holes.push(holePath);
          }
        }

        if (shapes.length > 0) {
          const shapeGeom = new THREE.ShapeGeometry(shapes);
          
          // Apply transformation to the shape's generated 3D vertices
          shapeGeom.applyMatrix4(parentMatrix);
          
          const pos = shapeGeom.getAttribute('position');
          const idx = shapeGeom.getIndex();

          if (pos) {
            for (let i = 0; i < pos.count; i++) {
              context.hatchPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
              context.hatchColors.push(r, g, b);
            }
            if (idx) {
              for (let i = 0; i < idx.count; i++) {
                context.hatchIndices.push(idx.getX(i) + context.hatchCurrentIndexOffset);
              }
              aggregatedStats.hatchTriangles += idx.count / 3;
            } else {
              for (let i = 0; i < pos.count; i++) {
                context.hatchIndices.push(context.hatchCurrentIndexOffset + i);
              }
              aggregatedStats.hatchTriangles += pos.count / 3;
            }
            context.hatchCurrentIndexOffset += pos.count;
          }
        }
      } 
      else if (entity.type === 'SOLID') {
        const solidEntity = entity as any;
        const vertices = solidEntity.geometry?.vertices;
        if (vertices && vertices.length >= 3) {
          const v0 = new THREE.Vector3(vertices[0][0], vertices[0][1], vertices[0][2] || 0).applyMatrix4(parentMatrix);
          const v1 = new THREE.Vector3(vertices[1][0], vertices[1][1], vertices[1][2] || 0).applyMatrix4(parentMatrix);
          const v2 = new THREE.Vector3(vertices[2][0], vertices[2][1], vertices[2][2] || 0).applyMatrix4(parentMatrix);
          
          context.hatchPositions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);
          context.hatchColors.push(r, g, b, r, g, b, r, g, b);
          context.hatchIndices.push(context.hatchCurrentIndexOffset, context.hatchCurrentIndexOffset + 1, context.hatchCurrentIndexOffset + 2);
          context.hatchCurrentIndexOffset += 3;
          aggregatedStats.hatchTriangles += 1;
          
          if (vertices.length >= 4) {
             const v3 = new THREE.Vector3(vertices[3][0], vertices[3][1], vertices[3][2] || 0).applyMatrix4(parentMatrix);
             // In DXF SOLID, 4-point solids are ordered v0, v1, v3, v2 for a quad.
             context.hatchPositions.push(v1.x, v1.y, v1.z, v3.x, v3.y, v3.z, v2.x, v2.y, v2.z);
             context.hatchColors.push(r, g, b, r, g, b, r, g, b);
             context.hatchIndices.push(context.hatchCurrentIndexOffset, context.hatchCurrentIndexOffset + 1, context.hatchCurrentIndexOffset + 2);
             context.hatchCurrentIndexOffset += 3;
             aggregatedStats.hatchTriangles += 1;
          }
        }
      }
      else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
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
          context.textMeshes.push(mesh);
          if (entity.type === 'MTEXT') {
             aggregatedStats.renderedMTexts++;
          } else {
             aggregatedStats.renderedTexts++;
          }
        }
      }
      else if (entity.type === 'INSERT') {
        const insertEntity = entity as CadInsertEntity;
        const block = doc.blocks ? doc.blocks[insertEntity.blockName] : null;
        
        if (!block || !block.entities) {
          aggregatedStats.skippedInserts++;
          continue;
        }

        const insertMat = new THREE.Matrix4();
        
        const position = new THREE.Vector3(...insertEntity.geometry.insertionPoint);
        const euler = new THREE.Euler(0, 0, THREE.MathUtils.degToRad(insertEntity.geometry.rotation || 0));
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const scale = new THREE.Vector3(...(insertEntity.geometry.scale || [1, 1, 1]));
        
        insertMat.compose(position, quaternion, scale);
        
        const basePoint = block.basePoint || [0,0,0];
        const baseOffset = new THREE.Matrix4().makeTranslation(-basePoint[0], -basePoint[1], -basePoint[2]);
        insertMat.multiply(baseOffset);
        
        const finalMatrix = parentMatrix.clone().multiply(insertMat);

        aggregatedStats.resolvedInserts++;
        this.processEntities(block.entities, finalMatrix, doc, depth + 1, getContext, aggregatedStats, {
          layer: effectiveLayer,
          color: color,
          linetype: ltName || undefined,
          ltscale: ltScale
        });
      }
      else if (entity.type === 'SPLINE') {
        const spline = entity as CadSplineEntity;
        const g = spline.geometry;
        
        let valid = true;
        if (g.degree !== 3) valid = false;
        else if (!g.controlPoints || g.controlPoints.length !== 4) valid = false;
        else if (g.rational) valid = false;
        else if (g.periodic) valid = false;
        else if (g.closed) valid = false;
        else if (g.weights && g.weights.some(w => Math.abs(w - 1) > 1e-6)) valid = false;
        else if (!g.knots || g.knots.length !== 8) valid = false;
        else {
          const k = g.knots;
          const isBezierKnot = 
                k[0] === k[1] && k[1] === k[2] && k[2] === k[3] &&
                k[4] === k[5] && k[5] === k[6] && k[6] === k[7] &&
                k[0] !== k[4];
          if (!isBezierKnot) valid = false;
        }

        if (!valid) {
          console.warn(`Unsupported SPLINE encountered (must be standard cubic Bezier):`, entity);
          aggregatedStats.unsupportedSplines++;
          continue;
        }

        const p0 = new THREE.Vector3(...g.controlPoints[0]).applyMatrix4(parentMatrix);
        const p1 = new THREE.Vector3(...g.controlPoints[1]).applyMatrix4(parentMatrix);
        const p2 = new THREE.Vector3(...g.controlPoints[2]).applyMatrix4(parentMatrix);
        const p3 = new THREE.Vector3(...g.controlPoints[3]).applyMatrix4(parentMatrix);

        const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
        const segments = 16;
        const points = curve.getPoints(segments);

                for (let j = 0; j < points.length - 1; j++) {
          this.addLineSegment(
            points[j].x, points[j].y, points[j].z,
            points[j+1].x, points[j+1].y, points[j+1].z,
            color, ltName, ltScale, doc, parentMatrix, context
          );
        }
        
        aggregatedStats.renderedSplines++;
        aggregatedStats.splineSegments += segments;
      }
      else if (entity.type === 'DIMENSION' || entity.type === 'LEADER' || entity.type === 'MLEADER' || entity.type === 'ARC_DIMENSION') {
        const dimEntity = entity as any;
        
        let hasPermissionToView = false;
        if (entity.type === 'DIMENSION') {
          hasPermissionToView = hasPermission(PERMISSIONS.CAD_DIMENSION_VIEW);
          if (hasPermissionToView) aggregatedStats.renderedDimensions++;
        } else if (entity.type === 'ARC_DIMENSION') {
          hasPermissionToView = hasPermission(PERMISSIONS.CAD_DIMENSION_VIEW);
          if (hasPermissionToView) aggregatedStats.renderedArcDimensions++;
        } else if (entity.type === 'LEADER') {
          hasPermissionToView = hasPermission(PERMISSIONS.CAD_LEADER_VIEW);
          if (hasPermissionToView) aggregatedStats.renderedLeaders++;
        } else if (entity.type === 'MLEADER') {
          hasPermissionToView = hasPermission(PERMISSIONS.CAD_MLEADER_VIEW);
          if (hasPermissionToView) aggregatedStats.renderedMLeaders++;
        }
        
        if (hasPermissionToView && dimEntity.geometry?.virtualEntities) {
          // Process virtual entities recursively
          this.processEntities(dimEntity.geometry.virtualEntities, parentMatrix, doc, depth + 1, getContext, aggregatedStats, {
            layer: effectiveLayer,
            color: color,
            linetype: ltName || undefined,
            ltscale: ltScale
          });
        }
      }
    }
  }

  private createTextMesh(textEntity: CadTextEntity): THREE.Mesh | null {
    const text = textEntity.text;
    const defaultCadHeight = textEntity.geometry.height || 4.0;
    const halign = textEntity.geometry.halign || 0;
    const valign = textEntity.geometry.valign || 0;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    const lines = text.split('\n');
    const fontSize = 64; 
    const lineHeight = fontSize * 1.35; // Standard MTEXT line spacing is roughly 1.35 to 1.5
    
    ctx.font = `${fontSize}px sans-serif`;
    let maxTextWidth = 0;
    let actualAscent = 0;
    let actualDescent = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const metrics = ctx.measureText(lines[i]);
        if (metrics.width > maxTextWidth) maxTextWidth = metrics.width;
        if (i === 0) actualAscent = metrics.actualBoundingBoxAscent || (fontSize * 0.8);
        if (i === lines.length - 1) actualDescent = metrics.actualBoundingBoxDescent || (fontSize * 0.2);
    }
    
    canvas.width = Math.ceil(maxTextWidth) + 8;
    canvas.height = (lines.length * lineHeight) + 12;
    
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = '#ffffff'; 
    ctx.textBaseline = 'alphabetic'; // Reliable baseline for loop
    
    // Handle horizontal alignment
    if (halign === 0 || halign === 3 || halign === 5) { ctx.textAlign = 'left'; }
    else if (halign === 1 || halign === 4) { ctx.textAlign = 'center'; }
    else if (halign === 2) { ctx.textAlign = 'right'; }
    else { ctx.textAlign = 'left'; }
    
    let drawX = 4;
    if (ctx.textAlign === 'center') drawX = canvas.width / 2;
    if (ctx.textAlign === 'right') drawX = canvas.width - 4;
    
    const firstLineDrawY = fontSize + 6;
    
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], drawX, firstLineDrawY + (i * lineHeight));
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide
    });
    
    const aspect = canvas.width / canvas.height;
    
    // Phase 5.14A.1: True Glyph Size Calibration
    // Use the actual measured glyph pixel height instead of arbitrary fontSize
    const glyphPixelHeight = actualAscent + actualDescent;
    const worldUnitsPerPixel = defaultCadHeight / glyphPixelHeight;
    
    const planeHeight = canvas.height * worldUnitsPerPixel;
    const planeWidth = canvas.width * worldUnitsPerPixel;
    
    // Temporary debug for verification
    if (text.includes("POLICE STATION") || text.includes("BANDAR ROAD") || text.includes("RAILWAY STATION") || text.includes("73.82")) {
      console.log("TEXT DEBUG [" + text.replace(/\n/g, '\\n') + "]:", {
        dxfHeight: defaultCadHeight,
        fontSizePx: fontSize,
        actualAscentPx: actualAscent,
        actualDescentPx: actualDescent,
        glyphPixelHeight: glyphPixelHeight,
        worldUnitsPerPixel: worldUnitsPerPixel,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        planeWidth: planeWidth,
        planeHeight: planeHeight
      });
    }
    
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    
    // Exact Mathematical Translation using Canvas Metrics
    const textTopY = firstLineDrawY - actualAscent;
    const lastLineDrawY = firstLineDrawY + ((lines.length - 1) * lineHeight);
    const textBottomY = lastLineDrawY + actualDescent;
    
    // Convert Canvas Y to Plane Y (Plane Y: +planeHeight/2 at top, -planeHeight/2 at bottom)
    const toPlaneY = (canvasY: number) => {
      return (canvas.height / 2 - canvasY) * (planeHeight / canvas.height);
    };
    
    // For MTEXT (which often has newlines), the default valign might be Top (3).
    // If valign=0 (Baseline), we align to the TOP line's baseline for MTEXT usually, or bottom line's?
    // AutoCAD usually anchors MTEXT based on attachment_point. 
    // We already mapped attachment_point to halign/valign.
    // 1 (Top Left) -> valign 3 (Top). 
    // 7 (Bottom Left) -> valign 1 (Bottom).
    
    const planeFirstBaselineY = toPlaneY(firstLineDrawY);
    const planeTopY = toPlaneY(textTopY);
    const planeBottomY = toPlaneY(textBottomY);
    const planeMiddleY = (planeTopY + planeBottomY) / 2;
    
    let transY = -planeFirstBaselineY; // default roughly baseline
    if (valign === 1) transY = -planeBottomY; // bottom aligned
    if (valign === 2) transY = -planeMiddleY; // centered
    if (valign === 3) transY = -planeTopY;    // top aligned
    
    // Text X coordinates on Canvas
    let textLeftX = drawX;
    if (ctx.textAlign === 'center') textLeftX = drawX - maxTextWidth / 2;
    if (ctx.textAlign === 'right') textLeftX = drawX - maxTextWidth;
    
    const textCenterX = textLeftX + maxTextWidth / 2;
    const textRightX = textLeftX + maxTextWidth;
    
    const toPlaneX = (canvasX: number) => {
      return (canvasX - canvas.width / 2) * (planeWidth / canvas.width);
    };
    
    const planeLeftX = toPlaneX(textLeftX);
    const planeCenterX = toPlaneX(textCenterX);
    const planeRightX = toPlaneX(textRightX);
    
    let transX = -planeLeftX;
    if (halign === 1 || halign === 4) transX = -planeCenterX; // centered
    if (halign === 2) transX = -planeRightX; // right aligned

    geometry.translate(transX, transY, 0);
    
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  public fitToDrawing() {
    if (!this.docBoundsMin || !this.docBoundsMax) return;

    const minX = this.docBoundsMin[0];
    const minY = this.docBoundsMin[1];
    const maxX = this.docBoundsMax[0];
    const maxY = this.docBoundsMax[1];

    const width = maxX - minX;
    const height = maxY - minY;
    
    const cx = minX + width / 2;
    const cy = minY + height / 2;

    this.camera.position.set(cx, cy, 10);
    this.camera.lookAt(cx, cy, 0);
    this.camera.zoom = 1;

    const aspect = this.container.clientWidth / this.container.clientHeight;
    const padding = 1.1;

    let targetHeight = height * padding;
    let targetWidth = width * padding;

    if (targetWidth / targetHeight > aspect) {
      targetHeight = targetWidth / aspect;
    } else {
      targetWidth = targetHeight * aspect;
    }

    this.camera.left = -targetWidth / 2;
    this.camera.right = targetWidth / 2;
    this.camera.top = targetHeight / 2;
    this.camera.bottom = -targetHeight / 2;
    this.camera.updateProjectionMatrix();

    this.baseUnitsPerPixel = targetHeight / this.container.clientHeight;
  }

  private handleResize() {
    if (this.isDisposed || !this.container) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    this.renderer.setSize(width, height);

    if (this.baseUnitsPerPixel <= 0) {
      const aspect = width / height;
      const h = this.camera.top - this.camera.bottom;
      const w = h * aspect;
      this.camera.left = -w / 2;
      this.camera.right = w / 2;
      this.camera.updateProjectionMatrix();
      return;
    }

    const viewHeight = height * this.baseUnitsPerPixel;
    const viewWidth = width * this.baseUnitsPerPixel;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  private handleWheel = (e: WheelEvent) => {
    if (!hasPermission(PERMISSIONS.CAD_ZOOM)) return;
    e.preventDefault();

    const rect = this.container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const cursorVec = new THREE.Vector3(nx, ny, 0);
    cursorVec.unproject(this.camera);

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.001, Math.min(1000, this.camera.zoom * zoomFactor));
    this.camera.zoom = newZoom;
    this.camera.updateProjectionMatrix();

    const cursorVecAfter = new THREE.Vector3(nx, ny, 0);
    cursorVecAfter.unproject(this.camera);

    const dx = cursorVec.x - cursorVecAfter.x;
    const dy = cursorVec.y - cursorVecAfter.y;

    this.camera.position.x += dx;
    this.camera.position.y += dy;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.isDragging = true;
    this.previousPointerPosition = { x: e.clientX, y: e.clientY };
    this.container.setPointerCapture(e.pointerId);
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!hasPermission(PERMISSIONS.CAD_PAN)) return;
    if (!this.isDragging) return;

    const dx = e.clientX - this.previousPointerPosition.x;
    const dy = e.clientY - this.previousPointerPosition.y;

    this.previousPointerPosition = { x: e.clientX, y: e.clientY };

    const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
    
    this.camera.position.x -= dx * unitsPerPixel;
    this.camera.position.y += dy * unitsPerPixel;
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.releasePointerCapture(e.pointerId);
    }
  };

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  private clearScene() {
    while(this.scene.children.length > 0){ 
      const child = this.scene.children[0];
      this.scene.remove(child);
      
      if (child instanceof THREE.LineSegments || child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.dispose();
        }
        
        const disposeMaterial = (mat: THREE.Material) => {
          mat.dispose();
          if ('map' in mat && (mat as any).map && typeof (mat as any).map.dispose === 'function') {
            (mat as any).map.dispose();
          }
        };

        if (Array.isArray(child.material)) {
          child.material.forEach(disposeMaterial);
        } else if (child.material) {
          disposeMaterial(child.material);
        }
      }
    }
  }

  public dispose() {
    this.isDisposed = true;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.resizeObserver.disconnect();

    if (this.container) {
      this.container.removeEventListener('wheel', this.handleWheel);
      this.container.removeEventListener('pointerdown', this.handlePointerDown);
      this.container.removeEventListener('pointermove', this.handlePointerMove);
      this.container.removeEventListener('pointerup', this.handlePointerUp);
      this.container.removeEventListener('pointercancel', this.handlePointerUp);
    }
    
    this.clearScene();
    
    this.renderer.dispose();
    
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

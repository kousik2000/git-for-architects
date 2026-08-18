import * as THREE from 'three';
import type { ArcosCadDocument, CadLineEntity, CadTextEntity, CadHatchEntity } from '../../types/cad-json';

interface PathInfo {
  points: THREE.Vector2[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export class CadRenderer {
  private container: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private resizeObserver: ResizeObserver;
  private animationFrameId: number | null = null;
  private isDisposed = false;

  // CAD State
  private docBoundsMin: [number, number, number] | null = null;
  private docBoundsMax: [number, number, number] | null = null;

  // Interaction State
  private isDragging = false;
  private previousPointerPosition = { x: 0, y: 0 };
  private baseUnitsPerPixel = 1;

  constructor(container: HTMLDivElement) {
    this.container = container;

    // 1. Initialize Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    // Dark background for CAD
    this.renderer.setClearColor(0x1e1e1e, 1);
    container.appendChild(this.renderer.domElement);

    // 2. Initialize Scene
    this.scene = new THREE.Scene();

    // 3. Initialize Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1000);
    this.camera.position.z = 10;

    // 4. Interaction Events
    this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    this.container.addEventListener('pointerdown', this.handlePointerDown);
    this.container.addEventListener('pointermove', this.handlePointerMove);
    this.container.addEventListener('pointerup', this.handlePointerUp);
    this.container.addEventListener('pointercancel', this.handlePointerUp);

    // 5. Handle Resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    // 6. Start Render Loop
    this.animate();
  }

  public loadDocument(doc: ArcosCadDocument) {
    if (this.isDisposed) return;
    
    this.clearScene();
    
    const startTime = performance.now();
    this.buildGeometry(doc);
    const endTime = performance.now();
    
    console.log(`[CadRenderer] Geometry built in ${(endTime - startTime).toFixed(2)}ms`);
    
    this.docBoundsMin = doc.bounds.min;
    this.docBoundsMax = doc.bounds.max;
    this.fitToDrawing();
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
        
        if (b > 0 && endAngle <= startAngle) {
          endAngle += Math.PI * 2;
        } else if (b < 0 && endAngle >= startAngle) {
          endAngle -= Math.PI * 2;
        }
        
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

  private buildGeometry(doc: ArcosCadDocument) {
    const lines: number[] = [];
    
    // Debug info
    let totalLwpolylines = 0;
    let renderedLwpolylines = 0;
    let openPolylines = 0;
    let closedPolylines = 0;
    let straightSegments = 0;
    let bulgedSegments = 0;
    let generatedVertices = 0;
    
    let renderedTexts = 0;
    let renderedHatches = 0;
    let hatchTriangles = 0;

    // Process LINE
    const lineEntities = doc.entities.filter(e => e.type === 'LINE') as CadLineEntity[];
    for (const entity of lineEntities) {
      lines.push(
        entity.geometry.start[0], entity.geometry.start[1], entity.geometry.start[2],
        entity.geometry.end[0], entity.geometry.end[1], entity.geometry.end[2]
      );
    }

    // Process LWPOLYLINE
    const polylineEntities = doc.entities.filter(e => e.type === 'LWPOLYLINE');
    totalLwpolylines = polylineEntities.length;
    
    for (const poly of polylineEntities) {
      // @ts-ignore
      const geometry = poly.geometry;
      const vertices = geometry.vertices;
      if (!vertices || vertices.length < 2) continue;
      
      renderedLwpolylines++;
      if (geometry.closed) {
        closedPolylines++;
      } else {
        openPolylines++;
      }

      const numSegments = geometry.closed ? vertices.length : vertices.length - 1;
      
      for (let i = 0; i < numSegments; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        
        const x1 = v1[0], y1 = v1[1], z1 = v1[2], b = v1[3] || 0.0;
        const x2 = v2[0], y2 = v2[1], z2 = v2[2];

        const dx = x2 - x1;
        const dy = y2 - y1;
        if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) {
          continue; // Degenerate segment
        }

        if (Math.abs(b) < 1e-6) {
          lines.push(x1, y1, z1, x2, y2, z2);
          straightSegments++;
          generatedVertices += 2;
        } else {
          bulgedSegments++;
          const c = (1 - b * b) / (2 * b);
          const cx = (x1 + x2) / 2 - c * dy / 2;
          const cy = (y1 + y2) / 2 + c * dx / 2;
          
          const R = Math.hypot(x1 - cx, y1 - cy);
          let startAngle = Math.atan2(y1 - cy, x1 - cx);
          let endAngle = Math.atan2(y2 - cy, x2 - cx);
          
          if (b > 0 && endAngle <= startAngle) {
            endAngle += Math.PI * 2;
          } else if (b < 0 && endAngle >= startAngle) {
            endAngle -= Math.PI * 2;
          }
          
          const angleDiff = Math.abs(endAngle - startAngle);
          const segments = Math.max(8, Math.min(128, Math.ceil(angleDiff * 15)));
          const step = (endAngle - startAngle) / segments;
          
          let prevX = x1;
          let prevY = y1;
          let prevZ = z1;
          
          for (let j = 1; j <= segments; j++) {
            const isLast = j === segments;
            const currentAngle = startAngle + step * j;
            const currX = isLast ? x2 : cx + R * Math.cos(currentAngle);
            const currY = isLast ? y2 : cy + R * Math.sin(currentAngle);
            const currZ = isLast ? z2 : z1 + (z2 - z1) * (j / segments);
            
            lines.push(prevX, prevY, prevZ, currX, currY, currZ);
            generatedVertices += 2;
            prevX = currX;
            prevY = currY;
            prevZ = currZ;
          }
        }
      }
    }

    if (lines.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      
      const material = new THREE.LineBasicMaterial({ color: 0xffffff });
      
      const lineSegments = new THREE.LineSegments(geometry, material);
      // Ensure lines are drawn on top if depth is an issue
      lineSegments.renderOrder = 1; 
      this.scene.add(lineSegments);
    }
    
    // Process HATCH (Phase 5.6)
    const hatchEntities = doc.entities.filter(e => e.type === 'HATCH') as CadHatchEntity[];
    const allHatchPositions: number[] = [];
    const allHatchIndices: number[] = [];
    let currentIndexOffset = 0;

    for (const hatch of hatchEntities) {
      if (!hatch.geometry.boundaryPaths || hatch.geometry.boundaryPaths.length === 0) continue;
      if (!hatch.geometry.solidFill) continue; // Only handle solid fills for now

      renderedHatches++;
      const pathInfos: PathInfo[] = [];

      for (const path of hatch.geometry.boundaryPaths) {
        let pts: THREE.Vector2[] = [];
        if (path.type === 'PolylinePath') {
          // bulge is at index 2 for PolylinePath
          pts = this.generate2DPoints(path.vertices, path.isClosed, 2);
        } else if (path.type === 'EdgePath') {
          // MVP for EdgePath: collect LineEdges
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

      // Geometric resolution of holes:
      // A path is considered a hole if its bounding box is strictly inside another path's bounding box.
      // If it is inside multiple, it belongs to the smallest one (not strictly necessary here as DXF usually doesn't nest holes).
      for (let i = 0; i < pathInfos.length; i++) {
        const pi = pathInfos[i];
        let isHole = false;
        
        for (let j = 0; j < pathInfos.length; j++) {
          if (i === j) continue;
          const pj = pathInfos[j];
          
          // Check if pi bounds are fully inside pj bounds (with a tiny epsilon for float safety)
          const eps = 1e-6;
          if (
            pi.bounds.minX >= pj.bounds.minX - eps &&
            pi.bounds.maxX <= pj.bounds.maxX + eps &&
            pi.bounds.minY >= pj.bounds.minY - eps &&
            pi.bounds.maxY <= pj.bounds.maxY + eps
          ) {
            // Also ensure pj is strictly larger to avoid self-matches if bounds are identical
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

      // Fallback if no outer paths found
      if (outerPaths.length === 0 && holePaths.length > 0) {
        outerPaths.push(holePaths[0]);
        holePaths.shift();
      }

      const shapes: THREE.Shape[] = [];
      for (const out of outerPaths) {
        shapes.push(new THREE.Shape(out.points));
      }

      for (const hole of holePaths) {
        const holePath = new THREE.Path(hole.points);
        if (shapes.length === 1) {
          shapes[0].holes.push(holePath);
        } else {
          // Assign to the first shape whose bounding box contains the hole
          let assigned = false;
          for (let i = 0; i < shapes.length; i++) {
            const outBounds = outerPaths[i].bounds;
            if (
              hole.bounds.minX >= outBounds.minX &&
              hole.bounds.maxX <= outBounds.maxX &&
              hole.bounds.minY >= outBounds.minY &&
              hole.bounds.maxY <= outBounds.maxY
            ) {
              shapes[i].holes.push(holePath);
              assigned = true;
              break;
            }
          }
          if (!assigned && shapes.length > 0) {
            shapes[shapes.length - 1].holes.push(holePath); // Fallback
          }
        }
      }

      if (shapes.length > 0) {
        const shapeGeom = new THREE.ShapeGeometry(shapes);
        const pos = shapeGeom.getAttribute('position');
        const idx = shapeGeom.getIndex();

        if (pos) {
          for (let i = 0; i < pos.count; i++) {
            allHatchPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
          }
          
          if (idx) {
            for (let i = 0; i < idx.count; i++) {
              allHatchIndices.push(idx.getX(i) + currentIndexOffset);
            }
            hatchTriangles += idx.count / 3;
          } else {
            for (let i = 0; i < pos.count; i++) {
              allHatchIndices.push(currentIndexOffset + i);
            }
            hatchTriangles += pos.count / 3;
          }
          
          currentIndexOffset += pos.count;
        }
      }
    }

    if (allHatchPositions.length > 0) {
      const mergedGeom = new THREE.BufferGeometry();
      mergedGeom.setAttribute('position', new THREE.Float32BufferAttribute(allHatchPositions, 3));
      mergedGeom.setIndex(allHatchIndices);
      
      const hatchMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x444444, 
        side: THREE.DoubleSide,
        depthWrite: false, // Ensures the hatch fill doesn't occlude lines in Z-buffer
        polygonOffset: true,
        polygonOffsetFactor: 1, // Pushes hatch further back visually
        polygonOffsetUnits: 1
      });
      
      const hatchMesh = new THREE.Mesh(mergedGeom, hatchMaterial);
      hatchMesh.renderOrder = 0; // Drawn before lines (which are 1)
      this.scene.add(hatchMesh);
    }

    // Process TEXT (MVP)
    const textEntities = doc.entities.filter(e => e.type === 'TEXT') as CadTextEntity[];
    for (const textEntity of textEntities) {
      if (!textEntity.text || !textEntity.geometry?.location) continue;
      
      const mesh = this.createTextMesh(textEntity.text);
      if (mesh) {
        mesh.position.set(
          textEntity.geometry.location[0],
          textEntity.geometry.location[1],
          textEntity.geometry.location[2] || 0
        );
        mesh.renderOrder = 2; // Text on top
        this.scene.add(mesh);
        renderedTexts++;
      }
    }
    
    console.log(`
LWPOLYLINE DEBUG
----------------
Total: ${totalLwpolylines}
Rendered: ${renderedLwpolylines}
Open: ${openPolylines}
Closed: ${closedPolylines}

HATCH DEBUG (Phase 5.6)
-----------------------
Rendered: ${renderedHatches}
Triangles: ${Math.floor(hatchTriangles)}
Meshes Created: ${allHatchPositions.length > 0 ? 1 : 0}

TEXT DEBUG
----------
Rendered MVP Text Entities: ${renderedTexts}
    `);
  }

  private createTextMesh(text: string): THREE.Mesh | null {
    const defaultCadHeight = 4.0;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    const fontSize = 64; 
    ctx.font = `${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    
    canvas.width = Math.ceil(textWidth) + 4;
    canvas.height = fontSize + 12;
    
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = '#ffffff'; 
    ctx.textBaseline = 'top';
    ctx.fillText(text, 2, 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    const aspect = canvas.width / canvas.height;
    const planeHeight = defaultCadHeight;
    const planeWidth = planeHeight * aspect;
    
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    geometry.translate(planeWidth / 2, planeHeight / 2, 0);
    
    return new THREE.Mesh(geometry, material);
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
          if ('map' in mat && mat.map) {
            mat.map.dispose();
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

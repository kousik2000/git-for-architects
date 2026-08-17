import * as THREE from 'three';
import type { ArcosCadDocument, CadLineEntity } from '../../types/cad-json';

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

    // Filter only LINE entities
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
      // @ts-ignore - we know it's LWPOLYLINE
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
      
      // Default line material (white)
      const material = new THREE.LineBasicMaterial({ color: 0xffffff });
      
      const lineSegments = new THREE.LineSegments(geometry, material);
      this.scene.add(lineSegments);
    }
    
    console.log(`
LWPOLYLINE DEBUG
----------------
Total: ${totalLwpolylines}
Rendered: ${renderedLwpolylines}

Open: ${openPolylines}
Closed: ${closedPolylines}

Straight segments: ${straightSegments}
Bulged segments: ${bulgedSegments}

Generated vertices: ${generatedVertices}
    `);
  }

  public fitToDrawing() {
    if (!this.docBoundsMin || !this.docBoundsMax) return;

    const minX = this.docBoundsMin[0];
    const minY = this.docBoundsMin[1];
    const maxX = this.docBoundsMax[0];
    const maxY = this.docBoundsMax[1];

    const width = maxX - minX;
    const height = maxY - minY;
    
    // Center point
    const cx = minX + width / 2;
    const cy = minY + height / 2;

    this.camera.position.set(cx, cy, 10);
    this.camera.lookAt(cx, cy, 0);
    this.camera.zoom = 1;

    const aspect = this.container.clientWidth / this.container.clientHeight;

    // Add 10% padding
    const padding = 1.1;

    let targetHeight = height * padding;
    let targetWidth = width * padding;

    if (targetWidth / targetHeight > aspect) {
      // Fit to width
      targetHeight = targetWidth / aspect;
    } else {
      // Fit to height
      targetWidth = targetHeight * aspect;
    }

    this.camera.left = -targetWidth / 2;
    this.camera.right = targetWidth / 2;
    this.camera.top = targetHeight / 2;
    this.camera.bottom = -targetHeight / 2;
    this.camera.updateProjectionMatrix();

    // Store base units per pixel for stable resizing
    this.baseUnitsPerPixel = targetHeight / this.container.clientHeight;
  }

  private handleResize() {
    if (this.isDisposed || !this.container) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    this.renderer.setSize(width, height);

    if (this.baseUnitsPerPixel <= 0) {
      // Initial state before loadDocument, just update aspect roughly
      const aspect = width / height;
      const h = this.camera.top - this.camera.bottom;
      const w = h * aspect;
      this.camera.left = -w / 2;
      this.camera.right = w / 2;
      this.camera.updateProjectionMatrix();
      return;
    }

    // Preserve camera.position and camera.zoom.
    // We adjust the frustum to exactly match the new pixel dimensions.
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

    // Map screen cursor to world coordinate BEFORE zoom
    const rect = this.container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Use unproject to find exact world coordinates of cursor
    const cursorVec = new THREE.Vector3(nx, ny, 0);
    cursorVec.unproject(this.camera);

    // Zoom factor
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.001, Math.min(1000, this.camera.zoom * zoomFactor));
    this.camera.zoom = newZoom;
    this.camera.updateProjectionMatrix();

    // Re-map screen cursor to world coordinate AFTER zoom
    const cursorVecAfter = new THREE.Vector3(nx, ny, 0);
    cursorVecAfter.unproject(this.camera);

    // Delta between where the cursor *was* and where it *is* now in world space
    const dx = cursorVec.x - cursorVecAfter.x;
    const dy = cursorVec.y - cursorVecAfter.y;

    // Adjust camera position so the cursor world point doesn't move
    this.camera.position.x += dx;
    this.camera.position.y += dy;
  };

  private handlePointerDown = (e: PointerEvent) => {
    // Only handle primary button (left click or touch)
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

    // Convert pixel delta to world units based on current zoom and baseUnitsPerPixel
    const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
    
    // Y pixel goes down, CAD Y goes up
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
    // Remove all children
    while(this.scene.children.length > 0){ 
      const child = this.scene.children[0];
      this.scene.remove(child);
      
      // Free GPU resources
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
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

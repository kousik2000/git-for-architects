import * as THREE from 'three';
import type { ArcosCadDocument, CadEntity, CadHatchEntity, CadInsertEntity, CadTextEntity, CadSplineEntity, CadViewportEntity } from '../../types/cad-json';
import { CadTransformResolver } from '../transforms/CadTransformResolver';
import { hasPermission } from '../../permissions/permission-service';
import { PERMISSIONS } from '../../permissions/permissions';
import { getAciColor } from './AciPalette';
import { CadPicker, type CadPickingContext } from '../picking/CadPicker';
import { CadSnapController } from '../snapping/CadSnapController';
import type { MeasurementReference } from '../types/measurement';
import type { CadSnappingConfig } from '../config/CadConfiguration';

interface PathInfo {
  points: THREE.Vector2[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

import { MeasurementController, MeasurementState, type DistanceMeasurement } from '../tools/MeasurementController';

export interface SelectionReference {
  entityId: string;
  entityType: string;
  layer: string;
  insertPath: string[];
  viewportId?: string;     // set when entity is rendered via a VIEWPORT
  space: string;           // 'model' | 'paperspace' | layout name
}

interface RenderContext {
  lines: number[];
  instanceIds: number[]; // Added for identity mapping
  colors: number[]; // Added for vertex colors
  hatchPositions: number[];
  hatchIndices: number[];
  hatchColors: number[]; // Added for hatch vertex colors
  hatchInstanceIds: number[]; // Added for identity mapping
  hatchCurrentIndexOffset: number;
  textMeshes: THREE.Mesh[];
  arrowheadMeshes: THREE.Object3D[];
  
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

// =============================================================================
// Phase 5.16C-C: View Basis Quaternion
// =============================================================================
//
// Given a DXF VIEWPORT viewDirection vector D, compute a THREE.Quaternion Q
// such that applying Q to Modelspace geometry (centred at viewCenter) makes
// the resulting XY coordinates equal to the viewport screen coordinates:
//
//   screenX = dot(P - viewCenter, right)
//   screenY = dot(P - viewCenter, up)
//
// This is achieved by building an orthonormal frame whose +Z aligns with D,
// then computing the quaternion that rotates that frame to align with the
// canonical Three.js frame (+X right, +Y up, +Z out-of-screen).
//
// For the standard top-view (D = (0,0,1)):
//   forward = (0,0,1), right = (1,0,0), up = (0,1,0)  →  identity quaternion
//   → ZERO change to existing 5.16B / 5.16C-B behaviour.
//
// Stable reference-up selection:
//   Default:  (0, 1, 0)
//   Fallback: (1, 0, 0)  when |forward · (0,1,0)| > 0.999  (nearly parallel)
//
// Returns: THREE.Quaternion (identity for top-view, generalised otherwise)
// =============================================================================
function computeViewBasisQuaternion(dx: number, dy: number, dz: number): THREE.Quaternion {
  // 1. Normalize the view direction.
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) {
    // Degenerate direction — fall back to top view (identity).
    return new THREE.Quaternion();
  }
  const fx = dx / len;
  const fy = dy / len;
  const fz = dz / len;

  // 2. Choose a stable reference-up vector.
  //    If forward is nearly parallel to (0,1,0) use (1,0,0) instead.
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(fy) > 0.999) {
    // nearly parallel to Y — use X as reference
    ux = 1; uy = 0; uz = 0;
  }

  // 3. right = normalize(referenceUp × forward)
  let rx = uy * fz - uz * fy;
  let ry = uz * fx - ux * fz;
  let rz = ux * fy - uy * fx;
  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
  if (rLen < 1e-10) {
    // Degenerate — fall back to identity.
    return new THREE.Quaternion();
  }
  rx /= rLen; ry /= rLen; rz /= rLen;

  // 4. up = normalize(forward × right)
  //    (guarantees orthonormality even if referenceUp was imprecise)
  let upx = fy * rz - fz * ry;
  let upy = fz * rx - fx * rz;
  let upz = fx * ry - fy * rx;
  const upLen = Math.sqrt(upx * upx + upy * upy + upz * upz);
  if (upLen < 1e-10) {
    return new THREE.Quaternion();
  }
  upx /= upLen; upy /= upLen; upz /= upLen;

  // 5. Build a rotation matrix that maps:
  //      +X → right   (rx, ry, rz)
  //      +Y → up      (upx, upy, upz)
  //      +Z → forward (fx, fy, fz)
  //
  // This matrix rotates the CANONICAL frame INTO the view frame.
  // THREE.Matrix4.setFromMatrix3 / THREE.Quaternion.setFromRotationMatrix
  // expects column-major storage where columns are basis vectors:
  //   col0 = right (maps +X)
  //   col1 = up    (maps +Y)
  //   col2 = forward (maps +Z)
  //
  // We want the INVERSE rotation: rotate geometry from Modelspace INTO the view frame.
  // The inverse of a rotation matrix is its transpose.
  // So we build the matrix with rows = basis vectors (= transpose of above).
  const m = new THREE.Matrix4();
  m.set(
    rx,  ry,  rz,  0,   // row 0 = right   (inverse maps +X to right direction)
    upx, upy, upz, 0,   // row 1 = up
    fx,  fy,  fz,  0,   // row 2 = forward
    0,   0,   0,   1
  );

  const q = new THREE.Quaternion();
  q.setFromRotationMatrix(m);
  return q;
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
  private gridHelper?: THREE.GridHelper;

  // Demand-driven rendering — Phase 5.17.3
  // Only re-render when the camera or scene has actually changed.
  private needsRender = true;

  // Selection Identity Mapping - Phase 5.18.2
  private selectionMap = new Map<number, SelectionReference>();
  private nextRenderInstanceId = 1;

  // Hover Interaction State
  public hoverHighlightEnabled = true;
  public hoverDelayMs = 200;
  private hoverOverlayGroup = new THREE.Group();
  private currentHoverRef: SelectionReference | null = null;
  private hoverTimer: number | null = null;

  private docBoundsMin: [number, number, number] | null = null;
  private docBoundsMax: [number, number, number] | null = null;
  private activeDoc: ArcosCadDocument | null = null;

  private modelSpaceGroup: THREE.Group | null = null;
  private activeViewports: {
    id: string;
    scene: THREE.Scene;
    container: THREE.Group;
    rotPivot: THREE.Group;        // Phase 5.16C-B: rotation pivot for twist + basis
    vpCenter: [number, number];
    viewCenter: [number, number];
    scale: number;
    twist: number;                // Phase 5.16C-B: twist angle in radians
    viewDir: [number, number, number]; // Phase 5.16C-C: viewport view direction
    basisQuaternion: THREE.Quaternion; // Phase 5.16C-C: cached basis rotation (viewDir→+Z)
    frozenLayers: string[];       // Phase 5.16C-D: viewport-specific frozen layers
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }[] = [];

  private isDragging = false;
  private previousPointerPosition = { x: 0, y: 0 };
  private pointerDownPosition = { x: 0, y: 0 };
  private baseUnitsPerPixel = 1;

  public onDocumentLoaded?: (doc: ArcosCadDocument) => void;
  public onRenderComplete?: () => void;
  public onEntitySelected?: (reference: SelectionReference | null) => void;
  public onEntityHovered?: (reference: SelectionReference | null, clientX: number, clientY: number) => void;
  public onSnapChanged?: (snap: MeasurementReference | null) => void;
  
  private raycaster = new THREE.Raycaster();
  private selectionOverlayGroup = new THREE.Group();
  private snapIndicatorGroup = new THREE.Group();
  private cursorOverlayGroup = new THREE.Group();
  private picker: CadPicker;
  private snapController: CadSnapController;
  private currentSnapConfig: CadSnappingConfig = { enabled: false, tolerancePixels: 30, indicatorSizePixels: 10, enabledTypes: { endpoint: true, midpoint: true, center: true, nearest: false } };
  private currentInteractionConfig?: CadInteractionConfig;

  // Phase 5.19.3
  public measurementController: MeasurementController;
  private measurementOverlayGroup: THREE.Group;
  
  // Measurement object pools for performance
  private measPointMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false });
  private measPointGeom = new THREE.CircleGeometry(1, 16);
  private measLineMat = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, transparent: true, opacity: 0.8 });
  private measPointPool: THREE.Mesh[] = [];
  private measLinePool: THREE.LineSegments[] = [];

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.measurementOverlayGroup = new THREE.Group();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x1e1e1e, 1);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.selectionOverlayGroup.name = 'selectionOverlayGroup';
    // Ensure overlay draws on top
    this.selectionOverlayGroup.renderOrder = 999;
    this.scene.add(this.selectionOverlayGroup);
    
    this.hoverOverlayGroup.name = 'hoverOverlayGroup';
    this.hoverOverlayGroup.renderOrder = 998;
    this.scene.add(this.hoverOverlayGroup);

    this.snapIndicatorGroup.name = 'snapIndicatorGroup';
    this.snapIndicatorGroup.renderOrder = 1000;
    this.scene.add(this.snapIndicatorGroup);

    this.measurementOverlayGroup.name = 'measurementOverlayGroup';
    this.measurementOverlayGroup.renderOrder = 1001;
    this.scene.add(this.measurementOverlayGroup);

    this.cursorOverlayGroup.name = 'cursorOverlayGroup';
    this.cursorOverlayGroup.renderOrder = 9998;
    this.scene.add(this.cursorOverlayGroup);
    this.rebuildCursorOverlay();

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 1000);
    this.camera.position.z = 10;

    this.container.addEventListener('wheel', this.handleWheel, { passive: false });
    this.container.addEventListener('pointerdown', this.handlePointerDown);
    this.container.addEventListener('pointermove', this.handlePointerMove);
    this.container.addEventListener('pointerup', this.handlePointerUp);
    this.container.addEventListener('pointercancel', this.handlePointerUp);
    this.container.addEventListener('pointerleave', this.handlePointerLeave);
    window.addEventListener('keydown', this.handleKeyDown);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.picker = new CadPicker({
      camera: this.camera,
      getDocument: () => this.activeDoc,
      rendererDomElement: this.renderer.domElement,
      getActiveSpace: () => this.activeSpace || 'model',
      zoomTolerancePixels: this.currentSnapConfig.tolerancePixels
    });

    this.snapController = new CadSnapController(
      this.picker,
      this.currentSnapConfig,
      (snap) => this.handleSnapChanged(snap)
    );

    this.measurementController = new MeasurementController((state, activePreview, history) => {
      this.updateMeasurementVisuals(state, activePreview, history);
    });

    this.animate();
  }

  
  /** Phase 5.17.3 — Signal that the next animation frame must re-render. */
  private markDirty() {
    this.needsRender = true;
  }

  public setLayerVisibility(layerName: string, visible: boolean) {
    const group = this.layerGroups.get(layerName);
    if (group) {
      group.visible = visible;
    }
    if (this.modelSpaceGroup) {
      const msGroup = this.modelSpaceGroup.children.find(c => c.name === `layer_${layerName}`);
      if (msGroup) msGroup.visible = visible;
    }
    // Phase 5.17.3: request one frame instead of synchronously rendering.
    // This also fixes the P2 "Show All fires 39 sequential synchronous renders" issue.
    this.markDirty();
  }

  // Phase 5.18.2: Public read-only accessors for identity mapping (used by Phase 5.18.3 hit-testing).
  public getSelectionReference(renderInstanceId: number): SelectionReference | undefined {
    return this.selectionMap.get(renderInstanceId);
  }

  public getSelectionMapSize(): number {
    return this.selectionMap.size;
  }

  public getActiveDoc(): ArcosCadDocument | null {
    return this.activeDoc;
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
    // Phase 5.18.2: Reset identity mapping on each render to avoid stale entries.
    this.selectionMap.clear();
    this.nextRenderInstanceId = 1;
    
    let entitiesToRender: CadEntity[] = [];
    if (spaceType === 'model') {
      entitiesToRender = this.activeDoc.entities;
    } else if (spaceType === 'layout' && layoutName) {
      const layout = this.activeDoc.layouts[layoutName];
      if (layout) {
        entitiesToRender = layout.entities;
      }
    }
    
    let paperSpaceEntities = entitiesToRender;
    let viewportEntities: CadViewportEntity[] = [];

    if (spaceType === 'layout') {
      paperSpaceEntities = entitiesToRender.filter(e => e.type !== 'VIEWPORT');
      viewportEntities = entitiesToRender.filter(e => e.type === 'VIEWPORT' && (e as any).geometry.status > 0) as CadViewportEntity[];
    }

    const startTime = performance.now();
    // Determine which space label to use for SelectionReference
    const spaceLabel = spaceType === 'model' ? 'model' : (layoutName || 'paperspace');
    this.buildGeometry(paperSpaceEntities, this.activeDoc, this.scene, spaceLabel, undefined);
    
    if (viewportEntities.length > 0 && hasPermission(PERMISSIONS.CAD_VIEWPORT_COMPOSE)) {
      if (!this.modelSpaceGroup) {
        this.modelSpaceGroup = new THREE.Group();
        // modelspace entities under viewport are tagged with space='model'
        this.buildGeometry(this.activeDoc.entities, this.activeDoc, this.modelSpaceGroup, 'model', undefined);
        // Force frustum culling off for the reused modelspace viewports to prevent disappearance bugs
        this.modelSpaceGroup.traverse(c => {
          c.frustumCulled = false;
        });
      }
      
      for (const vp of viewportEntities) {
        const vpCenter = vp.geometry.center;
        const vWidth = vp.geometry.width;
        const vHeight = vp.geometry.height;
        const viewCenter = vp.geometry.viewCenter;
        const viewHeight = vp.geometry.viewHeight;
        const scale = vHeight / viewHeight;

        // Phase 5.16C-B: twist angle in radians (DXF group code 51 / view_twist_angle).
        // Positive DXF twist = CCW view rotation (right-hand rule, +Z up).
        // We negate it when applying to geometry (view CCW == geometry CW).
        const twistRad: number = (vp.geometry.twist ?? 0);

        // Phase 5.16C-C: view direction (DXF group codes 16,26,36).
        // Defines the camera axis for this viewport.  (0,0,1) = standard top view.
        const rawDir = vp.geometry.viewDirection ?? [0, 0, 1];

        // ------------------------------------------------------------------
        // Phase 5.16C-C: Compute orthonormal view basis from viewDirection.
        //
        // The goal: construct a quaternion Q such that applying Q to the
        // modelSpaceGroup (already translated to -viewCenter) makes the
        // resulting XY coordinates equal to (dot(V,right), dot(V,up)) —
        // the correct viewport screen coordinates for any 3D Modelspace point.
        //
        // Algorithm:
        //   1. Normalize viewDirection → forward
        //   2. Choose stable reference-up (0,1,0); if |forward ≈ ±(0,1,0)| use (1,0,0)
        //   3. right = normalize(referenceUp × forward)
        //   4. up    = normalize(forward × right)
        //   5. Build rotation matrix [right | up | forward] and convert to quaternion.
        //
        // For (0,0,1): right=(1,0,0), up=(0,1,0) → identity → IDENTICAL to 5.16B.
        // ------------------------------------------------------------------
        const basisQuaternion = computeViewBasisQuaternion(
          rawDir[0] ?? 0, rawDir[1] ?? 0, rawDir[2] ?? 1
        );

        // --- Debug output for non-standard views ---
        const isTopView = Math.abs(rawDir[0]) < 1e-6 &&
                          Math.abs(rawDir[1]) < 1e-6 &&
                          (rawDir[2] ?? 1) > 0;
        if (!isTopView) {
          console.log(
            `[CadRenderer][ViewDir] VIEWPORT id=${vp.id}` +
            `  viewDir=(${rawDir[0]?.toFixed(4)},${rawDir[1]?.toFixed(4)},${rawDir[2]?.toFixed(4)})` +
            `  twist=${twistRad.toFixed(4)}rad` +
            `  scale=${scale.toFixed(6)}`
          );
        }
        if (Math.abs(twistRad) > 1e-9) {
          console.log(
            `[CadRenderer][Twist] VIEWPORT id=${vp.id}` +
            `  twist=${twistRad.toFixed(6)} rad (${(twistRad * 180 / Math.PI).toFixed(3)}°)` +
            `  viewCenter=(${viewCenter[0].toFixed(3)}, ${viewCenter[1].toFixed(3)})` +
            `  vpCenter=(${vpCenter[0].toFixed(3)}, ${vpCenter[1].toFixed(3)})` +
            `  scale=${scale.toFixed(6)}`
          );
        }
        
        const vpScene = new THREE.Scene();
        // vpContainer: positioned at vpCenter, scaled by viewport scale.
        // Implements T(vpCenter) × S(scale).
        const vpContainer = new THREE.Group();
        vpScene.add(vpContainer);

        // rotPivot carries both view-basis rotation and twist.
        // Combined rotation: R_twist × R_basis
        // Applied order (inner-first): R_basis first (project viewDir→+Z),
        // then R_twist (rotate around new Z = the view axis).
        const rotPivot = new THREE.Group();
        vpContainer.add(rotPivot);

        this.activeViewports.push({
          id: vp.id,
          scene: vpScene,
          container: vpContainer,
          rotPivot,
          vpCenter,
          viewCenter,
          scale,
          twist: twistRad,
          viewDir: [rawDir[0] ?? 0, rawDir[1] ?? 0, rawDir[2] ?? 1],
          basisQuaternion,
          frozenLayers: vp.geometry.frozenLayers || [],
          bounds: {
            minX: vpCenter[0] - vWidth / 2,
            maxX: vpCenter[0] + vWidth / 2,
            minY: vpCenter[1] - vHeight / 2,
            maxY: vpCenter[1] + vHeight / 2
          }
        });
        // Phase 5.18.2: Annotate viewport id on the vpScene so future hit tests can recover viewportId.
        vpScene.userData.viewportId = vp.id;
      }
    }
    const endTime = performance.now();
    
    console.log(`[CadRenderer] renderSpace(${spaceType}, ${layoutName || ''}) time: ${(endTime - startTime).toFixed(2)}ms`);
    
    let bounds = undefined;
    if (spaceType === 'layout' && layoutName) {
      const layout = this.activeDoc.layouts[layoutName];
      if (layout && (layout as any).bounds) {
        bounds = (layout as any).bounds;
      }
    }
    
    // Fit camera
    this.fitToDrawing(bounds);
    if (this.onRenderComplete) this.onRenderComplete();
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

  private addLineSegment(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, ltName: string | null, ltScale: number, doc: ArcosCadDocument, parentMatrix: THREE.Matrix4, context: RenderContext, renderInstanceId: number) {
    const vec3 = new THREE.Vector3();
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;

    const pattern = (ltName && doc.linetypes && doc.linetypes[ltName]) ? doc.linetypes[ltName].pattern : null;
    
    if (!pattern || pattern.length === 0) {
      vec3.set(x1, y1, z1).applyMatrix4(parentMatrix);
      context.lines.push(vec3.x, vec3.y, vec3.z);
      context.colors.push(r, g, b);
      context.instanceIds.push(renderInstanceId);
      
      vec3.set(x2, y2, z2).applyMatrix4(parentMatrix);
      context.lines.push(vec3.x, vec3.y, vec3.z);
      context.colors.push(r, g, b);
      context.instanceIds.push(renderInstanceId);
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
        vec3.set(x1 + dirX * currentPos, y1 + dirY * currentPos, z1 + dirZ * currentPos).applyMatrix4(parentMatrix);
        context.lines.push(vec3.x, vec3.y, vec3.z);
        context.colors.push(r, g, b);
        context.instanceIds.push(renderInstanceId);
        
        vec3.set(x1 + dirX * nextPos, y1 + dirY * nextPos, z1 + dirZ * nextPos).applyMatrix4(parentMatrix);
        context.lines.push(vec3.x, vec3.y, vec3.z);
        context.colors.push(r, g, b);
        context.instanceIds.push(renderInstanceId);
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

  private buildGeometry(
    entities: CadEntity[],
    doc: ArcosCadDocument,
    targetGroup: THREE.Object3D = this.scene,
    space: string = 'model',
    viewportId: string | undefined = undefined
  ) {
    const layerContexts = new Map<string, RenderContext>();
    if (targetGroup === this.scene) {
      this.layerGroups.clear();
    }
    
    const getContext = (layer: string) => {
      if (!layerContexts.has(layer)) {
        layerContexts.set(layer, {
          lines: [], colors: [], instanceIds: [],
          hatchPositions: [], hatchIndices: [], hatchColors: [], hatchInstanceIds: [], hatchCurrentIndexOffset: 0, textMeshes: [], arrowheadMeshes: [],
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
    this.processEntities(entities, identityMatrix, doc, 0, getContext, aggregatedStats, {}, [], space, viewportId);
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
        geometry.setAttribute('instanceId', new THREE.Uint32BufferAttribute(ctx.instanceIds, 1));
        geometry.computeBoundingSphere();
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
        mergedGeom.setAttribute('instanceId', new THREE.Uint32BufferAttribute(ctx.hatchInstanceIds, 1));
        mergedGeom.setIndex(ctx.hatchIndices);
        mergedGeom.computeBoundingSphere();
        
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
      ctx.arrowheadMeshes.forEach(mesh => group.add(mesh));
      targetGroup.add(group);
      if (targetGroup === this.scene) {
        this.layerGroups.set(layerName, group);
      }
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
    inherited: InheritedStyle = {},
    insertPath: string[] = [],
    space: string = 'model',
    viewportId: string | undefined = undefined
  ) {
    if (depth > 20) {
      console.warn('Max block nesting depth exceeded.');
      return;
    }



    for (const entity of entities) {
      const renderInstanceId = this.nextRenderInstanceId++;
      
      const effectiveLayer = (entity.layer === '0' && inherited.layer) ? inherited.layer : entity.layer;
      
      this.selectionMap.set(renderInstanceId, {
        entityId: entity.id,
        entityType: entity.type,
        layer: effectiveLayer,
        insertPath: [...insertPath],
        space,
        ...(viewportId !== undefined ? { viewportId } : {})
      });

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
          color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId
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
            this.addLineSegment(x1, y1, z1, x2, y2, z2, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
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
              
              this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
              
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
          
          this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
          
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
          
          this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
          
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
            this.addLineSegment(prevX, prevY, prevZ, currX, currY, currZ, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
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
        this.addLineSegment(px - d, py, pz, px + d, py, pz, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
        this.addLineSegment(px, py - d, pz, px, py + d, pz, color, ltName, ltScale, doc, parentMatrix, context, renderInstanceId);
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
              } else if (edge.type === 'ArcEdge') {
                const cx = edge.center[0];
                const cy = edge.center[1];
                let sa = (edge.startAngle * Math.PI) / 180;
                let ea = (edge.endAngle * Math.PI) / 180;
                
                if (edge.ccw) {
                  if (ea < sa) ea += Math.PI * 2;
                } else {
                  if (sa < ea) sa += Math.PI * 2;
                }
                
                const diff = ea - sa;
                const segments = Math.max(8, Math.min(64, Math.ceil(64 * Math.abs(diff) / (Math.PI * 2))));
                const step = diff / segments;
                
                for (let j = 0; j <= segments; j++) {
                  const angle = sa + step * j;
                  const pt = new THREE.Vector2(cx + edge.radius * Math.cos(angle), cy + edge.radius * Math.sin(angle));
                  // Skip if very close to the last point to avoid degenerate edges
                  if (pts.length === 0 || pts[pts.length - 1].distanceTo(pt) > 1e-6) {
                    pts.push(pt);
                  }
                }
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
              context.hatchInstanceIds.push(renderInstanceId);
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
          context.hatchInstanceIds.push(renderInstanceId, renderInstanceId, renderInstanceId);
          context.hatchIndices.push(context.hatchCurrentIndexOffset, context.hatchCurrentIndexOffset + 1, context.hatchCurrentIndexOffset + 2);
          context.hatchCurrentIndexOffset += 3;
          aggregatedStats.hatchTriangles += 1;
          
          if (vertices.length >= 4) {
             const v3 = new THREE.Vector3(vertices[3][0], vertices[3][1], vertices[3][2] || 0).applyMatrix4(parentMatrix);
             // In DXF SOLID, 4-point solids are ordered v0, v1, v3, v2 for a quad.
             context.hatchPositions.push(v1.x, v1.y, v1.z, v3.x, v3.y, v3.z, v2.x, v2.y, v2.z);
             context.hatchColors.push(r, g, b, r, g, b, r, g, b);
             context.hatchInstanceIds.push(renderInstanceId, renderInstanceId, renderInstanceId);
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
          
          mesh.userData.renderInstanceId = renderInstanceId;
          
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
        }, [...insertPath, entity.id], space, viewportId);
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

        // Note: control points are already in world space (parentMatrix applied above),
        // so use identity matrix in addLineSegment to avoid double-transform.
        const identityMat = new THREE.Matrix4();
        for (let j = 0; j < points.length - 1; j++) {
          this.addLineSegment(
            points[j].x, points[j].y, points[j].z,
            points[j+1].x, points[j+1].y, points[j+1].z,
            color, ltName, ltScale, doc, identityMat, context, renderInstanceId
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
          // Process virtual entities recursively — pass insertPath and space context through
          this.processEntities(dimEntity.geometry.virtualEntities, parentMatrix, doc, depth + 1, getContext, aggregatedStats, {
            layer: effectiveLayer,
            color: color,
            linetype: ltName || undefined,
            ltscale: ltScale
          }, insertPath, space, viewportId);
        }
        
        // Phase 5.15B: Generate synthetic arrowhead if specified
        if (hasPermissionToView && hasPermission(PERMISSIONS.CAD_ARROWHEAD_VIEW) && dimEntity.geometry?.arrowhead) {
          const arrowData = dimEntity.geometry.arrowhead;
          if (arrowData.type === 'closed_filled') {
            const mesh = this.createArrowheadMesh(arrowData.p1, arrowData.p2, arrowData.size, color);
            if (mesh) {
              const obj = new THREE.Object3D();
              obj.add(mesh);
              obj.applyMatrix4(parentMatrix);
              
              context.arrowheadMeshes.push(obj);
            }
          }
        }
      }
    }
  }

  private createArrowheadMesh(p1: number[], p2: number[], size: number, color: number): THREE.Mesh | null {
    if (!p1 || !p2 || p1.length < 2 || p2.length < 2) return null;
    
    // Direction vector from p1 (tip) towards p2 (shaft)
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) return null;
    
    const dirX = dx / dist;
    const dirY = dy / dist;
    
    // Arrowhead geometry: length = size, half_width = size / 6
    const length = size;
    const halfWidth = size / 6.0; 
    
    // Calculate base of the arrow
    const baseX = p1[0] + dirX * length;
    const baseY = p1[1] + dirY * length;
    
    // Perpendicular vector for the width
    const perpX = -dirY;
    const perpY = dirX;
    
    const pLeftX = baseX + perpX * halfWidth;
    const pLeftY = baseY + perpY * halfWidth;
    
    const pRightX = baseX - perpX * halfWidth;
    const pRightY = baseY - perpY * halfWidth;
    
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      p1[0], p1[1], p1[2] || 0.0,
      pLeftX, pLeftY, (p1[2] || 0.0),
      pRightX, pRightY, (p1[2] || 0.0)
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  private createTextMesh(textEntity: CadTextEntity): THREE.Mesh | null {
    const text = textEntity.text;
    if (!text) return null;
    const defaultCadHeight = textEntity.geometry.height || 4.0;
    const halign = textEntity.geometry.halign || 0;
    const valign = textEntity.geometry.valign || 0;
    
    // Resolve font
    let fontFamily = '"Arial", sans-serif';
    let rawFontName = (textEntity as any).inlineFont;
    
    if (!rawFontName && textEntity.styleName && this.activeDoc?.styles) {
      const style = this.activeDoc.styles[textEntity.styleName];
      if (style) {
        rawFontName = style.font;
      }
    }
    
    if (rawFontName) {
      const lowerFont = rawFontName.toLowerCase();
      if (lowerFont.includes('romans') || lowerFont.includes('isocp') || lowerFont.includes('.shx')) {
        fontFamily = 'sans-serif';
      } else if (lowerFont.includes('arial') || lowerFont.includes('helvetica')) {
        fontFamily = '"Arial", sans-serif';
      } else if (lowerFont.includes('times') || lowerFont.includes('roman')) {
        fontFamily = '"Times New Roman", serif';
      } else if (lowerFont.includes('courier') || lowerFont.includes('mono')) {
        fontFamily = '"Courier New", monospace';
      } else if (lowerFont.includes('stylus')) {
        fontFamily = '"Stylus BT", "Arial", sans-serif';
      } else {
        fontFamily = `"${rawFontName.replace(/\.ttf$/i, '')}", sans-serif`;
      }
    }
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    const textStr = text.replace(/\\P/g, '\n');
    const lines = textStr.split('\n');
    const fontSize = 64; 
    const lineHeight = fontSize * 1.35; // Standard MTEXT line spacing is roughly 1.35 to 1.5
    
    ctx.font = `${fontSize}px ${fontFamily}`;
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
    
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = '#ffffff'; 
    ctx.textBaseline = 'alphabetic'; // Reliable baseline for loop
    
    console.log(`[Font Debug] Rendering Text: "${textStr.substring(0, 15)}" | inline: ${(textEntity as any).inlineFont} | style: ${textEntity.styleName} | final ctx.font: ${ctx.font}`);
    
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
    
    // Phase 5.14A.1: True Glyph Size Calibration
    
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

  public fitToDrawing(explicitBounds?: {min: number[], max: number[]}) {
    let minX, minY, maxX, maxY;
    
    if (explicitBounds) {
      minX = explicitBounds.min[0];
      minY = explicitBounds.min[1];
      maxX = explicitBounds.max[0];
      maxY = explicitBounds.max[1];
    } else {
      // Attempt to compute bounding box from current scene
      const box = new THREE.Box3().setFromObject(this.scene);
      console.log(`[CadRenderer][fitToDrawing] this.scene children count: ${this.scene.children.length}`);
      console.log(`[CadRenderer][fitToDrawing] box from scene:`, { min: box.min, max: box.max, isEmpty: box.isEmpty() });
      
      // If scene is empty or bounds are invalid, fallback to doc bounds
      if (box.isEmpty() || !isFinite(box.min.x)) {
        if (!this.docBoundsMin || !this.docBoundsMax) return;
        minX = this.docBoundsMin[0];
        minY = this.docBoundsMin[1];
        maxX = this.docBoundsMax[0];
        maxY = this.docBoundsMax[1];
        console.log(`[CadRenderer][fitToDrawing] Fallback to docBounds: min=(${minX},${minY}), max=(${maxX},${maxY})`);
      } else {
        minX = box.min.x;
        minY = box.min.y;
        maxX = box.max.x;
        maxY = box.max.y;
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    
    const cx = minX + width / 2;
    const cy = minY + height / 2;
    console.log(`[CadRenderer][fitToDrawing] Final camera lookAt: (${cx}, ${cy}), width=${width}, height=${height}`);

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
    this.markDirty();
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
      this.markDirty();
      return;
    }

    const viewHeight = height * this.baseUnitsPerPixel;
    const viewWidth = width * this.baseUnitsPerPixel;

    this.camera.left = -viewWidth / 2;
    this.camera.right = viewWidth / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.markDirty();
  }

  private handleWheel = (e: WheelEvent) => {
    // Only handle wheel events that originate directly on the WebGL canvas.
    // This prevents scroll from firing when the mouse is over an overlay panel.
    if (e.target !== this.renderer.domElement) return;
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
    this.markDirty();
  };

  private handlePointerDown = (e: PointerEvent) => {
    // Only initiate drag when the pointer is pressed directly on the WebGL canvas.
    if (e.target !== this.renderer.domElement) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }

    this.isDragging = true;
    this.previousPointerPosition = { x: e.clientX, y: e.clientY };
    this.pointerDownPosition = { x: e.clientX, y: e.clientY };
    this.container.setPointerCapture(e.pointerId);
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!hasPermission(PERMISSIONS.CAD_PAN)) return;
    
    if (this.isDragging) {
      const dx = e.clientX - this.previousPointerPosition.x;
      const dy = e.clientY - this.previousPointerPosition.y;

      this.previousPointerPosition = { x: e.clientX, y: e.clientY };

      const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
      
      this.camera.position.x -= dx * unitsPerPixel;
      this.camera.position.y += dy * unitsPerPixel;
      
      if (this.currentSnapConfig.enabled) {
        this.snapController.clearSnap();
      }

      // Update cursor position during drag as well
      const worldPoint = this.picker.getWorldPointFromScreen(e.clientX, e.clientY);
      this.cursorOverlayGroup.position.copy(worldPoint);

      this.markDirty();
    } else {
      // Immediate OSNAP evaluation (no debounce)
      if (this.currentSnapConfig.enabled) {
        this.snapController.evaluateHit(e.clientX, e.clientY);
      }

      const worldPoint = this.picker.getWorldPointFromScreen(e.clientX, e.clientY);
      const snap = this.currentSnapConfig.enabled ? this.snapController.getCurrentSnap() : null;

      if (this.measurementController.handlePointerMove(worldPoint, snap)) {
        this.cursorOverlayGroup.position.copy(worldPoint);
        this.markDirty();
        // If measuring, don't show hover highlights
        if (this.hoverTimer) {
          window.clearTimeout(this.hoverTimer);
          this.hoverTimer = null;
        }
        this.highlightHoverEntity(null);
        if (this.onEntityHovered) this.onEntityHovered(null, e.clientX, e.clientY);
        return;
      }

      this.cursorOverlayGroup.position.copy(worldPoint);
      this.markDirty();

      // Debounced hover detection
      if (this.hoverHighlightEnabled || this.onEntityHovered) {
        if (this.hoverTimer) {
          window.clearTimeout(this.hoverTimer);
        }
        this.hoverTimer = window.setTimeout(() => {
          this.handleHoverTest(e);
        }, this.hoverDelayMs);
      }
    }
  };

  private handlePointerLeave = (e: PointerEvent) => {
    if (this.hoverTimer) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    this.highlightHoverEntity(null);
    if (this.currentSnapConfig.enabled) {
      this.snapController.clearSnap();
    }
    if (this.onEntityHovered) {
      this.onEntityHovered(null, e.clientX, e.clientY);
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.isDragging) {
      this.isDragging = false;
      this.container.releasePointerCapture(e.pointerId);

      // Distinguish click from drag (e.g. less than 4 pixels distance)
      const dist = Math.hypot(e.clientX - this.pointerDownPosition.x, e.clientY - this.pointerDownPosition.y);
      if (dist < 4) {
        const worldPoint = this.picker.getWorldPointFromScreen(e.clientX, e.clientY);
        const snap = this.currentSnapConfig.enabled ? this.snapController.getCurrentSnap() : null;
        
        if (this.measurementController.handlePointClick(worldPoint, snap)) {
          return; // Click was consumed by measurement, do not select entities
        }

        if (this.currentSnapConfig.enabled) {
          // When Snap is enabled, click does NOT open inspection / selection.
          this.highlightHoverEntity(null);
          if (this.onEntityHovered) {
            this.onEntityHovered(null, e.clientX, e.clientY);
          }
        } else {
          if (this.currentInteractionConfig?.selectionOnClick !== false) {
            this.handleHitTest(e);
          }
        }
      }
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      let clearedMeasurement = false;
      if (this.measurementController.isActive()) {
        this.measurementController.cancel();
        clearedMeasurement = true;
      }
      if (this.measurementController.getHistory().length > 0) {
        this.measurementController.clearMeasurements();
        clearedMeasurement = true;
      }
      
      if (!clearedMeasurement) {
        this.clearSelection();
      }
    }
  };

  private handleHitTest(e: PointerEvent) {
    // Perform hit test and call onEntitySelected
    const ref = this.performRaycast(e);
    // If we clicked, optionally clear hover to avoid double overlay if they overlap
    if (ref) {
      this.highlightHoverEntity(null);
      if (this.onEntityHovered) {
        this.onEntityHovered(null, e.clientX, e.clientY);
      }
    }
    this.highlightEntity(ref);
    if (this.onEntitySelected) this.onEntitySelected(ref);
  }

  private handleHoverTest(e: PointerEvent) {
    if (this.currentSnapConfig.enabled) return;
    const ref = this.performRaycast(e);
    
    if (this.hoverHighlightEnabled || this.onEntityHovered) {
      this.highlightHoverEntity(ref);
      if (this.onEntityHovered) {
        this.onEntityHovered(ref, e.clientX, e.clientY);
      }
    }
  }

  public setSnappingConfig(config: CadSnappingConfig) {
    this.currentSnapConfig = config;
    this.snapController.updateConfig(config);
    if ((this.picker as any).context) {
      (this.picker as any).context.zoomTolerancePixels = config.tolerancePixels;
    }
    
    // Phase 5.19.2: Clear stale selection if we transition to Snap mode
    // and selection on click is disabled.
    if (this.currentSnapConfig.enabled && !this.currentInteractionConfig?.selectionOnSnapClick) {
      this.clearSelection();
    }
    
    this.markDirty();
  }

  public setInteractionConfig(config: CadInteractionConfig) {
    this.currentInteractionConfig = config;
    this.hoverHighlightEnabled = config.hoverHighlight;
    // To support config-driven pickbox and crosshair updates:
    this.rebuildCursorOverlay(config);
    
    // Clear stale selection if we toggle selection on click to OFF while Snap is ON
    if (this.currentSnapConfig.enabled && !this.currentInteractionConfig?.selectionOnSnapClick) {
      this.clearSelection();
    }
    
    this.markDirty();
  }

  private clearSelection() {
    this.highlightEntity(null);
    if (this.onEntitySelected) {
      this.onEntitySelected(null);
    }
  }

  private rebuildCursorOverlay(config?: CadInteractionConfig) {
    // Clear old cursor
    while (this.cursorOverlayGroup.children.length > 0) {
      const child = this.cursorOverlayGroup.children[0] as THREE.Mesh | THREE.LineSegments;
      this.cursorOverlayGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    // Since we don't have direct access to interaction config easily here, 
    // we use provided config, or fallback to default
    const pickboxConfig = config?.pickbox || { enabled: true, sizePixels: 10, borderWidth: 1 };
    const crosshairConfig = config?.crosshair || { enabled: true, horizontalLengthPixels: 100, verticalLengthPixels: 100, lineWidth: 1 };

    const color = 0xffffff; // White cursor

    if (pickboxConfig.enabled) {
      // Create a 1x1 plane geometry (wireframe for border only, no fill)
      const geom = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({ 
        color, 
        wireframe: true, 
        depthTest: false, 
        depthWrite: false 
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = "pickbox";
      // We store the target pixel size in userData to scale it dynamically
      mesh.userData.sizePixels = pickboxConfig.sizePixels;
      this.cursorOverlayGroup.add(mesh);
    }

    if (crosshairConfig.enabled) {
      const geom = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        -0.5, 0, 0,  // horizontal line
         0.5, 0, 0,
         0, -0.5, 0, // vertical line
         0,  0.5, 0
      ]);
      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      const mat = new THREE.LineBasicMaterial({
        color,
        depthTest: false,
        depthWrite: false
      });
      const lines = new THREE.LineSegments(geom, mat);
      lines.name = "crosshair";
      lines.userData.hSize = crosshairConfig.horizontalLengthPixels;
      lines.userData.vSize = crosshairConfig.verticalLengthPixels;
      this.cursorOverlayGroup.add(lines);
    }
  }

  private handleSnapChanged(snap: MeasurementReference | null) {
    // Clear old indicator
    while (this.snapIndicatorGroup.children.length > 0) {
      const child = this.snapIndicatorGroup.children[0] as THREE.Mesh;
      this.snapIndicatorGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    if (snap && this.currentSnapConfig.enabled) {
      const color = 0xffff00; // YELLOW
      let geometry: THREE.BufferGeometry;
      
      const size = this.currentSnapConfig.indicatorSizePixels || 10;
      const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
      
      // We create the geometry with a size of 1, and scale the mesh
      if (snap.snapType === 'endpoint') {
        geometry = new THREE.PlaneGeometry(1, 1);
      } else if (snap.snapType === 'midpoint') {
        geometry = new THREE.CircleGeometry(1 / 1.5, 3);
      } else if (snap.snapType === 'center') {
        geometry = new THREE.CircleGeometry(1 / 2, 16);
      } else {
        geometry = new THREE.CircleGeometry(1 / 2, 4); 
      }

      const material = new THREE.MeshBasicMaterial({
        color: color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 1.0,
        wireframe: snap.snapType === 'endpoint' || snap.snapType === 'center'
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "snap_indicator";
      mesh.position.set(snap.point.x, snap.point.y, snap.point.z || 0);
      // Scale it so that 1 world unit becomes 'size' screen pixels
      mesh.scale.set(size * unitsPerPixel, size * unitsPerPixel, 1);
      mesh.renderOrder = 9999;
      this.snapIndicatorGroup.add(mesh);
    }

    this.markDirty();
    if (this.onSnapChanged) {
      this.onSnapChanged(snap);
    }
  }

  private updateMeasurementVisuals(
    state: MeasurementState,
    activePreview: { point1: THREE.Vector3; currentPoint: THREE.Vector3; distance: number } | null,
    history: DistanceMeasurement[]
  ) {
    // Hide all existing objects from the pool
    this.measPointPool.forEach(m => m.visible = false);
    this.measLinePool.forEach(m => m.visible = false);

    const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
    const markerSize = 6 * unitsPerPixel; 

    let pointIndex = 0;
    let lineIndex = 0;

    const getPointMesh = () => {
      if (pointIndex >= this.measPointPool.length) {
        const mesh = new THREE.Mesh(this.measPointGeom, this.measPointMat);
        mesh.renderOrder = 1001;
        this.measurementOverlayGroup.add(mesh);
        this.measPointPool.push(mesh);
      }
      const mesh = this.measPointPool[pointIndex++];
      mesh.visible = true;
      return mesh;
    };

    const getLineMesh = () => {
      if (lineIndex >= this.measLinePool.length) {
        // Initialize with 2 dummy points
        const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const mesh = new THREE.LineSegments(geom, this.measLineMat);
        mesh.renderOrder = 1001;
        this.measurementOverlayGroup.add(mesh);
        this.measLinePool.push(mesh);
      }
      const mesh = this.measLinePool[lineIndex++];
      mesh.visible = true;
      return mesh;
    };

    const drawPoint = (p: THREE.Vector3) => {
      const mesh = getPointMesh();
      mesh.position.copy(p);
      mesh.scale.set(markerSize, markerSize, 1);
    };

    const drawLine = (p1: THREE.Vector3, p2: THREE.Vector3) => {
      const mesh = getLineMesh();
      const positions = mesh.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, p1.x, p1.y, p1.z);
      positions.setXYZ(1, p2.x, p2.y, p2.z);
      positions.needsUpdate = true;
    };

    for (const meas of history) {
      drawPoint(meas.point1);
      drawPoint(meas.point2);
      drawLine(meas.point1, meas.point2);
    }

    if (activePreview) {
      drawPoint(activePreview.point1);
      drawPoint(activePreview.currentPoint);
      drawLine(activePreview.point1, activePreview.currentPoint);
    }
    
    this.markDirty();
  }

  private performRaycast(e: PointerEvent): SelectionReference | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to NDC
    const ndcX = (x / rect.width) * 2 - 1;
    const ndcY = -(y / rect.height) * 2 + 1;
    const mouseNDC = new THREE.Vector2(ndcX, ndcY);

    this.raycaster.setFromCamera(mouseNDC, this.camera);

    // Calculate dynamic Line threshold (~5 pixels visual tolerance)
    const viewHeightWorld = (this.camera.top - this.camera.bottom) / this.camera.zoom;
    const worldUnitsPerPixel = viewHeightWorld / rect.height;
    this.raycaster.params.Line.threshold = worldUnitsPerPixel * 5;

    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    for (const intersect of intersects) {
      const obj = intersect.object;
      let instanceId: number | undefined;

      if (obj.type === 'LineSegments' && intersect.index !== undefined) {
        const geom = (obj as THREE.LineSegments).geometry as THREE.BufferGeometry;
        const attr = geom.getAttribute('instanceId');
        if (attr) {
          instanceId = attr.getX(intersect.index);
        }
      } else if (obj.type === 'Mesh') {
        // Could be Hatch/Solid (has instanceId buffer) or Text/Mtext (has userData)
        if (obj.userData && obj.userData.renderInstanceId) {
          instanceId = obj.userData.renderInstanceId;
        } else if (intersect.face) {
          const geom = (obj as THREE.Mesh).geometry as THREE.BufferGeometry;
          const attr = geom.getAttribute('instanceId');
          if (attr) {
            instanceId = attr.getX(intersect.face.a);
          }
        }
      } else if (obj.type === 'Sprite') {
        if (obj.userData && obj.userData.renderInstanceId) {
          instanceId = obj.userData.renderInstanceId;
        }
      }

      if (instanceId !== undefined && instanceId > 0) {
        const ref = this.getSelectionReference(instanceId);
        if (ref) {
          return ref;
        }
      }
    }

    return null;
  }

  private findEntityById(id: string): CadEntity | null {
    if (!this.activeDoc) return null;
    
    // Check main entities
    const mainMatch = this.activeDoc.entities.find(e => e.id === id);
    if (mainMatch) return mainMatch;
    
    // Check blocks
    if (this.activeDoc.blocks) {
      for (const blockName in this.activeDoc.blocks) {
        const block = this.activeDoc.blocks[blockName];
        if (block && block.entities) {
          const blockMatch = block.entities.find(e => e.id === id);
          if (blockMatch) return blockMatch;
        }
      }
    }
    
    return null;
  }

  private highlightEntity(ref: SelectionReference | null) {
    // Clear old highlight
    while (this.selectionOverlayGroup.children.length > 0) {
      const child = this.selectionOverlayGroup.children[0] as any;
      this.selectionOverlayGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }

    if (!ref || !this.activeDoc) {
      this.markDirty();
      return;
    }

    const entity = this.findEntityById(ref.entityId);
    if (!entity) {
      this.markDirty();
      return;
    }

    // Check layer visibility
    const layerName = ref.layer;
    const docLayer = this.activeDoc.layers.find(l => l.name === layerName);
    if (docLayer && (!docLayer.visible || docLayer.frozen)) {
      this.markDirty();
      return; // Do not highlight hidden layer
    }
    const layerGroup = this.layerGroups.get(layerName);
    if (layerGroup && !layerGroup.visible) {
      this.markDirty();
      return;
    }

    // Build transformation stack for nested INSERTs
    let parentMatrix = new THREE.Matrix4();
    if (ref.insertPath && ref.insertPath.length > 0) {
      for (const insertId of ref.insertPath) {
        const insertEntity = this.findEntityById(insertId) as CadInsertEntity;
        if (insertEntity && insertEntity.type === 'INSERT') {
          const block = this.activeDoc.blocks ? this.activeDoc.blocks[insertEntity.blockName] : null;
          if (block) {
            const insertMat = new THREE.Matrix4();
            const position = new THREE.Vector3(...(insertEntity.geometry.insertionPoint || [0,0,0]));
            const euler = new THREE.Euler(0, 0, THREE.MathUtils.degToRad(insertEntity.geometry.rotation || 0));
            const quaternion = new THREE.Quaternion().setFromEuler(euler);
            const scale = new THREE.Vector3(...(insertEntity.geometry.scale || [1, 1, 1]));
            insertMat.compose(position, quaternion, scale);
            
            const basePoint = block.basePoint || [0,0,0];
            const baseOffset = new THREE.Matrix4().makeTranslation(-basePoint[0], -basePoint[1], -basePoint[2]);
            insertMat.multiply(baseOffset);
            
            parentMatrix.multiply(insertMat);
          }
        }
      }
    }

    const getContext = (): RenderContext => {
      return {
        lines: [], colors: [], instanceIds: [],
        hatchPositions: [], hatchIndices: [], hatchColors: [], hatchInstanceIds: [], hatchCurrentIndexOffset: 0, textMeshes: [], arrowheadMeshes: [],
        stats: {
          totalLwpolylines: 0, renderedLwpolylines: 0, renderedHatches: 0, hatchTriangles: 0, renderedTexts: 0, resolvedInserts: 0,
          skippedInserts: 0, renderedSplines: 0, unsupportedSplines: 0, splineSegments: 0, renderedCircles: 0, renderedArcs: 0, renderedEllipses: 0, renderedPoints: 0,
          renderedDimensions: 0, renderedLeaders: 0, renderedMLeaders: 0, renderedArcDimensions: 0, renderedMTexts: 0
        }
      };
    };

    const ctx = getContext();
    this.processEntities([entity], parentMatrix, this.activeDoc, 0, () => ctx, ctx.stats, {}, [], ref.space, ref.viewportId);

    const highlightColor = 0xffff00; // Yellow highlight
    console.log(`[Highlight] Generated vertices: lines=${ctx.lines.length / 3}, hatches=${ctx.hatchPositions.length / 3}, texts=${ctx.textMeshes.length}`);
    if (ctx.lines.length > 0) {
        console.log(`[Highlight] First line vertex: ${ctx.lines[0]}, ${ctx.lines[1]}, ${ctx.lines[2]}`);
    }

    // Lines (LWPOLYLINE, LINE, ARC, CIRCLE, SPLINE, borders)
    if (ctx.lines.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(ctx.lines, 3));
      const mat = new THREE.LineBasicMaterial({
        color: highlightColor,
        depthTest: false,
        depthWrite: false,
        linewidth: 2 // Has no effect on most WebGL implementations, but logical intent
      });
      const lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = 999;
      this.selectionOverlayGroup.add(lines);
    }

    // Fill meshes (HATCH, SOLID)
    if (ctx.hatchPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(ctx.hatchPositions, 3));
      geom.setIndex(ctx.hatchIndices);
      const mat = new THREE.MeshBasicMaterial({
        color: highlightColor,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.4
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 999;
      this.selectionOverlayGroup.add(mesh);
    }

    // Texts (TEXT, MTEXT) - simplified highlight as bounding box
    for (const mesh of ctx.textMeshes) {
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (bbox) {
            const width = bbox.max.x - bbox.min.x;
            const height = bbox.max.y - bbox.min.y;
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            
            const planeGeom = new THREE.PlaneGeometry(width, height);
            const mat = new THREE.MeshBasicMaterial({
                color: highlightColor,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.4
            });
            const plane = new THREE.Mesh(planeGeom, mat);
            plane.position.copy(center);
            plane.quaternion.copy(mesh.quaternion);
            plane.renderOrder = 999;
            this.selectionOverlayGroup.add(plane);
        }
    }

    this.markDirty();
  }

  private isSameReference(refA: SelectionReference | null, refB: SelectionReference | null): boolean {
    if (refA === refB) return true;
    if (!refA || !refB) return false;
    return refA.entityId === refB.entityId &&
           refA.space === refB.space &&
           refA.insertPath.join() === refB.insertPath.join();
  }

  private highlightHoverEntity(ref: SelectionReference | null) {
    if (this.currentSnapConfig.enabled) {
      ref = null;
    }
    if (this.isSameReference(ref, this.currentHoverRef)) return;
    this.currentHoverRef = ref;

    // Clear existing hover overlay
    while (this.hoverOverlayGroup.children.length > 0) {
      const child = this.hoverOverlayGroup.children[0];
      this.hoverOverlayGroup.remove(child);
      if ((child as THREE.Mesh).geometry) ((child as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach(m => m.dispose());
        else mat.dispose();
      }
    }

    if (!ref) {
      this.markDirty();
      return;
    }

    if (!this.hoverHighlightEnabled) {
      return;
    }

    const entity = this.findEntityById(ref.entityId);
    if (!entity) return;

    // Resolve transform context if it's inside an INSERT
    const parentMatrix = CadTransformResolver.resolveTransformWithLookup(ref.insertPath, (id) => this.findEntityById(id) || undefined);

    // Mock RenderContext for collecting geometries
    const ctx = {
      lines: [] as number[],
      colors: [] as number[],
      instanceIds: [] as number[],
      hatchPositions: [] as number[],
      hatchIndices: [] as number[],
      hatchColors: [] as number[],
      hatchInstanceIds: [] as number[],
      hatchCurrentIndexOffset: 0,
      textMeshes: [] as THREE.Mesh[],
      arrowheadMeshes: [] as THREE.Mesh[],
      stats: { arcs: 0, ellipses: 0, points: 0, dimensions: 0, leaders: 0, mleaders: 0, arcDimensions: 0, mtexts: 0 }
    };

    const getContext = () => (ctx as any);
    this.processEntities([entity], parentMatrix, this.activeDoc!, 0, getContext, ctx.stats as any, {}, [], ref.space, ref.viewportId);

    const highlightColor = 0xff00ff; // Magenta hover

    if (ctx.lines.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(ctx.lines, 3));
      const mat = new THREE.LineBasicMaterial({
        color: highlightColor,
        depthTest: false,
        depthWrite: false
      });
      const lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = 998;
      this.hoverOverlayGroup.add(lines);
    }

    if (ctx.hatchPositions.length > 0) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(ctx.hatchPositions, 3));
      geom.setIndex(ctx.hatchIndices);
      const mat = new THREE.MeshBasicMaterial({
        color: highlightColor,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.3
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.renderOrder = 998;
      this.hoverOverlayGroup.add(mesh);
    }

    for (const mesh of ctx.textMeshes) {
        mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (bbox) {
            const width = bbox.max.x - bbox.min.x;
            const height = bbox.max.y - bbox.min.y;
            const center = new THREE.Vector3();
            bbox.getCenter(center);
            
            const planeGeom = new THREE.PlaneGeometry(width, height);
            const mat = new THREE.MeshBasicMaterial({
                color: highlightColor,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 0.3
            });
            const plane = new THREE.Mesh(planeGeom, mat);
            plane.position.copy(center);
            plane.quaternion.copy(mesh.quaternion);
            plane.renderOrder = 998;
            this.hoverOverlayGroup.add(plane);
        }
    }

    this.markDirty();
  }

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);

    // Phase 5.17.3 — Demand-driven rendering.
    // Skip all GPU work when the camera and scene have not changed.
    if (!this.needsRender) return;
    this.needsRender = false;

    // Phase 5.19.2 - Auto-size snap indicators based on zoom
    if (this.snapIndicatorGroup && this.snapIndicatorGroup.children.length > 0) {
      const size = this.currentSnapConfig.indicatorSizePixels || 10;
      const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
      this.snapIndicatorGroup.children[0].scale.setScalar(size * unitsPerPixel);
    }

    if (this.cursorOverlayGroup && this.cursorOverlayGroup.children.length > 0) {
      const unitsPerPixel = this.baseUnitsPerPixel / this.camera.zoom;
      for (const child of this.cursorOverlayGroup.children) {
        if (child.name === "pickbox") {
          const size = child.userData.sizePixels || 10;
          child.scale.setScalar(size * unitsPerPixel);
        } else if (child.name === "crosshair") {
          const hSize = child.userData.hSize || 100;
          const vSize = child.userData.vSize || 100;
          child.scale.set(hSize * unitsPerPixel, vSize * unitsPerPixel, 1);
        }
      }
    }

    if (this.activeViewports.length > 0 && hasPermission(PERMISSIONS.CAD_VIEWPORT_VIEW)) {
      this.renderer.setScissorTest(false);
      this.renderer.autoClear = false;
      this.renderer.clear();
      
      // Render paperspace
      this.renderer.render(this.scene, this.camera);
      
      // Render viewports
      this.renderer.setScissorTest(true);
      const canvas = this.renderer.domElement;
      // Use physical pixels for scissor
      const w = canvas.width;
      const h = canvas.height;
      
      if (this.modelSpaceGroup) {
        for (const vp of this.activeViewports) {
          // Scissor bounds are always the PaperSpace rectangle — twist does NOT rotate the boundary.
          const minVec = new THREE.Vector3(vp.bounds.minX, vp.bounds.minY, 0).project(this.camera);
          const maxVec = new THREE.Vector3(vp.bounds.maxX, vp.bounds.maxY, 0).project(this.camera);
          
          // NDC to physical pixels
          const x1 = (minVec.x + 1) / 2 * w;
          const y1 = (minVec.y + 1) / 2 * h;
          const x2 = (maxVec.x + 1) / 2 * w;
          const y2 = (maxVec.y + 1) / 2 * h;
          
          const sX = Math.min(x1, x2);
          const sY = Math.min(y1, y2);
          const sW = Math.abs(x2 - x1);
          const sH = Math.abs(y2 - y1);
          
          // Check if scissor intersects screen
          if (sX < w && sX + sW > 0 && sY < h && sY + sH > 0 && sW > 0 && sH > 0) {
            // clamp to screen
            const cx = Math.max(0, sX);
            const cy = Math.max(0, sY);
            const cw = Math.min(w, sX + sW) - cx;
            const ch = Math.min(h, sY + sH) - cy;
            
            if (cw > 0 && ch > 0) {
              this.renderer.setScissor(Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch));
              this.renderer.clearDepth();
              
              // --- Phase 5.16C-B/C: Full viewport transform hierarchy ---
              //
              // Transform chain: T(vpCenter) × S(scale) × R(twist) × R_basis × T(-viewCenter)
              //
              // vpContainer  [position=vpCenter, scale=scale]
              //   └─ rotPivot  [quaternion = R_twist(-twist) × R_basis(viewDir→+Z)]
              //        └─ modelSpaceGroup  [position=-viewCenter]
              //
              // R_basis rotates the view direction to align with +Z so that the
              // projected XY coordinates are exactly the viewport's screen-right / screen-up
              // components.  For top-view (0,0,1), R_basis is the identity quaternion.
              //
              // R_twist then rotates around the new Z axis (= the view direction).
              vp.container.position.set(vp.vpCenter[0], vp.vpCenter[1], 0);
              vp.container.scale.set(vp.scale, vp.scale, vp.scale);

              // Compute combined rotation: R_twist × R_basis
              // (quaternion multiplication: right-to-left application order)
              if (hasPermission(PERMISSIONS.CAD_VIEWPORT_VIEW_DIRECTION) ||
                  hasPermission(PERMISSIONS.CAD_VIEWPORT_TWIST)) {

                const applyBasis = hasPermission(PERMISSIONS.CAD_VIEWPORT_VIEW_DIRECTION);
                const applyTwist = hasPermission(PERMISSIONS.CAD_VIEWPORT_TWIST);

                if (applyBasis && applyTwist) {
                  // Full combined rotation: R_twist(-twist_z) composed with R_basis
                  const twistQ = new THREE.Quaternion().setFromAxisAngle(
                    new THREE.Vector3(0, 0, 1), -vp.twist
                  );
                  // R_basis rotates viewDir→+Z; twistQ rotates around that new +Z
                  // Combined (applied right-to-left): basisQ first, then twistQ
                  vp.rotPivot.quaternion.copy(twistQ).multiply(vp.basisQuaternion);
                } else if (applyBasis) {
                  vp.rotPivot.quaternion.copy(vp.basisQuaternion);
                } else if (applyTwist) {
                  vp.rotPivot.quaternion.setFromAxisAngle(
                    new THREE.Vector3(0, 0, 1), -vp.twist
                  );
                } else {
                  vp.rotPivot.quaternion.identity();
                }
              } else {
                vp.rotPivot.quaternion.identity();
              }

              // modelSpaceGroup translates by -viewCenter inside the pivot's local space
              this.modelSpaceGroup.position.set(-vp.viewCenter[0], -vp.viewCenter[1], 0);
              
              // Attach modelSpaceGroup under rotPivot
              vp.rotPivot.add(this.modelSpaceGroup);
              
              // --- Phase 5.16C-D: Viewport-specific frozen layers ---
              // Temporarily hide layer groups that are globally visible but frozen in this viewport.
              // This relies on the synchronous nature of Three.js render().
              const hiddenGroups: THREE.Object3D[] = [];
              if (hasPermission(PERMISSIONS.CAD_VIEWPORT_FROZEN_LAYERS) && vp.frozenLayers && vp.frozenLayers.length > 0) {
                for (const layerName of vp.frozenLayers) {
                  const msGroup = this.modelSpaceGroup.children.find(c => c.name === `layer_${layerName}`);
                  if (msGroup && msGroup.visible) {
                    msGroup.visible = false;
                    hiddenGroups.push(msGroup);
                  }
                }
              }

              this.renderer.render(vp.scene, this.camera);
              
              // Restore visibility for the groups we hid
              for (const msGroup of hiddenGroups) {
                msGroup.visible = true;
              }
            }
          }
        }
      }
      this.renderer.setScissorTest(false);
      this.renderer.autoClear = true;
    } else {
      this.renderer.setScissorTest(false);
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);
    }
    
    // Dispatch render update event for overlays (e.g. MeasurementOverlay)
    this.container.dispatchEvent(new CustomEvent('cad-render-update'));
  };

  private clearScene() {
    this.activeViewports = [];
    
    // Preserve special nodes: camera, gridHelper, selectionOverlayGroup, hoverOverlayGroup, snapIndicatorGroup
    const preserveNodes = new Set<THREE.Object3D>([
        this.camera, 
        this.selectionOverlayGroup,
        this.hoverOverlayGroup,
        this.snapIndicatorGroup,
        this.cursorOverlayGroup
    ]);
    if (this.gridHelper) {
        preserveNodes.add(this.gridHelper);
    }
    
    const toRemove: THREE.Object3D[] = [];
    this.scene.children.forEach(c => {
      if (!preserveNodes.has(c)) {
        toRemove.push(c);
      }
    });
    
    const disposeObject = (obj: THREE.Object3D) => {
      if (obj instanceof THREE.LineSegments || obj instanceof THREE.Mesh) {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        
        const disposeMaterial = (mat: THREE.Material) => {
          mat.dispose();
          if ('map' in mat && (mat as any).map && typeof (mat as any).map.dispose === 'function') {
            (mat as any).map.dispose();
          }
        };

        if (Array.isArray(obj.material)) {
          obj.material.forEach(disposeMaterial);
        } else if (obj.material) {
          disposeMaterial(obj.material);
        }
      }
    };
    
    toRemove.forEach((child) => {
      child.traverse((c) => disposeObject(c));
      this.scene.remove(child);
    });
  }

  public getScreenPointFromWorld(worldPoint: THREE.Vector3): { x: number; y: number } | null {
    if (!this.camera || !this.renderer) return null;
    
    const clone = worldPoint.clone();
    clone.project(this.camera);
    
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((clone.x + 1) / 2) * rect.width;
    const y = (-(clone.y - 1) / 2) * rect.height;
    
    return { x, y };
  }

  public getContainer(): HTMLDivElement {
    return this.container;
  }

  public dispose() {
    this.isDisposed = true;
    
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.highlightEntity(null);
    this.highlightHoverEntity(null);

    if (this.container) {
      this.container.removeEventListener('wheel', this.handleWheel);
      this.container.removeEventListener('pointerdown', this.handlePointerDown);
      this.container.removeEventListener('pointermove', this.handlePointerMove);
      this.container.removeEventListener('pointerup', this.handlePointerUp);
      this.container.removeEventListener('pointercancel', this.handlePointerUp);
      this.container.removeEventListener('pointerleave', this.handlePointerLeave);
    }
    
    this.resizeObserver.disconnect();
    this.clearScene();
    
    this.renderer.dispose();
    
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

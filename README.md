# ARCOS CAD — Phase 1 to Phase 5.4 Implementation Record

> This document records the ARCOS CAD work completed through Phase 5.4, including the setup flow, architecture, implementation goals, and the commands used for testing.
>
> **Current status:** Phase 1–5.4 completed. Phase 5.5 is the next step (backend parser expansion for HATCH, INSERT, and TEXT properties).

---

## 1. Project Goal

The goal of ARCOS CAD is to build a CAD web application that can accept CAD files such as DWG, convert them into a browser-friendly representation, and eventually render the drawing using WebGL.

The architecture established so far is:

```text
DWG
 │
 ▼
LibreDWG / CAD conversion layer
 │
 ▼
DXF
 │
 ▼
ezdxf parser
 │
 ▼
ARCOS CAD JSON
 │
 ▼
Django API
 │
 ▼
React frontend
 │
 ▼
WebGL renderer (Three.js)          ← Phase 5 (active)
```

The important design decision is that the frontend does **not** need to understand DWG/DXF internals. It consumes the application's own normalized CAD JSON format.

---

# Phase 1 — Project / Environment Setup

## Objective

Set up the basic ARCOS CAD development environment and establish the separation between:

- React frontend
- Django application/API
- CAD processing service
- Docker-based CAD dependencies

## Target architecture

```text
React Frontend
      │
      ▼
Django Backend
      │
      ▼
CAD Processing Service
      │
      ▼
LibreDWG / DXF / ezdxf
```

The CAD conversion/parsing work was kept separate from the frontend so that CAD-specific native dependencies do not need to run inside the browser.

## Phase 1 completion criteria

- Project structure established.
- Backend and CAD-processing responsibilities separated.
- Docker used for CAD/native dependencies where required.
- CAD processing can be tested independently from the React UI.

---

# Phase 2 — DWG → DXF Conversion

## Objective

Establish a reliable conversion path from DWG into DXF.

The reason for introducing DXF as the intermediate representation is that it gives the application a more accessible format for extracting CAD entities while keeping the original DWG processing isolated from the application layer.

## Processing flow

```text
Input DWG
   │
   ▼
LibreDWG
   │
   ▼
DXF
   │
   ▼
CAD parser
```

## Expected result

A valid DWG file should be converted into a DXF file before the parsing stage.

The converted DXF becomes the input for the Python/ezdxf parser.

## Phase 2 completion criteria

- DWG conversion works.
- DXF can be generated from the supplied DWG.
- The generated DXF can be consumed by the parser.
- Conversion is isolated from the browser/frontend.

---

# Phase 3 — CAD Parser / API Integration

## Objective

Build the CAD parsing service around `ezdxf` and expose it through an API.

The parser is responsible for reading the converted DXF and extracting CAD information into the ARCOS CAD JSON structure.

## Processing flow

```text
DWG
 │
 ▼
LibreDWG
 │
 ▼
DXF
 │
 ▼
ezdxf
 │
 ├── layers
 ├── blocks
 ├── layouts
 ├── bounds
 └── entities
       │
       ▼
ARCOS CAD JSON
```

## Parser responsibilities

The parser collects the information required by the viewer instead of exposing raw DXF internals directly.

The normalized output contains:

- document information
- file format
- units
- drawing bounds
- layers
- blocks
- layouts
- entities
- entity geometry
- parser statistics
- warnings/errors where applicable

## API endpoint

The CAD parser is exposed through:

```text
POST /api/cad/parse/
```

The endpoint accepts a CAD file as multipart form data and returns the parsed ARCOS CAD JSON.

## Phase 3 completion criteria

- API accepts a CAD file.
- CAD conversion/parsing pipeline can be invoked through the API.
- Parsed data is returned as JSON.
- JSON is structured independently from the original DXF representation.

---

# Phase 4 — ARCOS CAD JSON Parser

## Objective

Create and validate the application's normalized CAD JSON output.

This phase is the bridge between the CAD backend and the future WebGL renderer.

## Supported entity representation

The parser is designed around CAD entities such as:

```text
LINE
LWPOLYLINE
POLYLINE
CIRCLE
ARC
ELLIPSE
SPLINE
POINT
TEXT
MTEXT
HATCH
INSERT
```

The tested drawing contained:

```text
LINE
HATCH
LWPOLYLINE
```

## JSON structure

The generated output follows this general structure:

```json
{
  "success": true,
  "data": {
    "version": "1.0",
    "document": {},
    "units": {},
    "bounds": {},
    "layers": [],
    "blocks": [],
    "layouts": [],
    "entities": [],
    "statistics": {},
    "warnings": []
  }
}
```

## Phase 4 validation

The test DWG was:

```text
F2841747.dwg
```

The parser successfully generated:

- `success: true`
- document metadata
- drawing bounds
- layer information
- block information
- entity data
- geometry data

The tested output contained approximately:

```text
Entities : 40,363
Layers   : 38
Blocks   : 4
```

Entity distribution in the tested drawing:

```text
LINE          30,361
HATCH          7,362
LWPOLYLINE     2,640
----------------------
TOTAL         40,363
```

The validation also showed:

```text
Duplicate entity IDs : 0
Invalid numeric data : 0
Unsupported entities : 0
Warnings             : 0
```

The parser completed the test in approximately:

```text
7.7 seconds
```

---

# Phase 4 Testing

## API test

The command used to test the complete CAD parsing endpoint was:

```powershell
curl.exe -X POST "http://192.168.0.100:8000/api/cad/parse/" -F "file=@C:\Users\kousi\Downloads\F2841747.dwg" --output "parsed_cad.json"
```

This command:

1. Sends the DWG to the CAD parsing API.
2. Uses the `file` multipart field.
3. Runs the complete DWG → DXF → parser pipeline.
4. Saves the returned JSON as:

```text
parsed_cad.json
```

## Inspect the generated JSON

PowerShell:

```powershell
Get-Content .\parsed_cad.json
```

Pretty-print JSON:

```powershell
Get-Content .\parsed_cad.json | ConvertFrom-Json | ConvertTo-Json -Depth 100
```

Check whether the API reported success:

```powershell
(Get-Content .\parsed_cad.json | ConvertFrom-Json).success
```

Expected:

```text
True
```

---

# Phase 4 Final Status

## Status: COMPLETE

The Phase 4 objective has been achieved for the current POC.

The complete backend pipeline can now produce a normalized ARCOS CAD JSON document from a DWG upload.

```text
             PHASE 4 COMPLETE
                    │
                    ▼
                DWG file
                    │
                    ▼
              CAD conversion
                    │
                    ▼
                  DXF
                    │
                    ▼
                 ezdxf
                    │
                    ▼
             ARCOS CAD JSON
                    │
                    ▼
             Ready for frontend
```

---

# Current ARCOS CAD Pipeline

```text
┌─────────────────────┐
│     DWG file        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    LibreDWG         │
│   conversion layer  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│        DXF          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       ezdxf         │
│      CAD parser     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  ARCOS CAD JSON     │
│      v1.0           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│    Django API       │
│ /api/cad/parse/     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   React Frontend    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   WebGL Renderer    │
│  Three.js (Phase 5) │
└─────────────────────┘
```

---

# Phase 5 — WebGL CAD Viewer

Phase 5 is the WebGL viewer phase. It is broken down into sub-phases delivered incrementally.

---

# Phase 5.1 — WebGL Renderer Foundation (LINE)

## Objective

Bootstrap the Three.js WebGL renderer inside the React frontend and render the first CAD entity type: `LINE`.

## Architecture

```text
React
  └── CadViewer (component)
        └── CadRenderer (class)
              └── Three.js
                    └── WebGL
```

## Implementation

- Initialized `THREE.WebGLRenderer` with antialiasing and dark background (`#1e1e1e`).
- Initialized `THREE.OrthographicCamera` (correct for 2D CAD — no perspective distortion).
- All LINE entities batched into a single `THREE.BufferGeometry` using `THREE.Float32BufferAttribute`.
- Rendered as a single `THREE.LineSegments` draw call.
- Implemented `fitToDrawing()` using document bounds from the ARCOS CAD JSON.
- Implemented `CadRenderer.dispose()` with full WebGL resource cleanup (geometry, materials, renderer).

## Files introduced

| File | Purpose |
|------|---------|
| `frontend/src/cad/renderer/CadRenderer.ts` | Core WebGL renderer class |
| `frontend/src/components/cad-viewer/CadViewer.tsx` | React component wrapping the renderer |
| `frontend/src/components/cad-viewer/CadViewer.css` | Viewer layout styles |
| `frontend/src/types/cad-json.ts` | TypeScript types for the ARCOS CAD JSON schema |
| `frontend/src/services/cadApi.ts` | Frontend API client (`parseDwg`, `convertDwg`) |

## Phase 5.1 result

- LINE entities render correctly in WebGL.
- `fitToDrawing()` correctly frames the drawing on load.
- Camera uses document bounds (`doc.bounds.min` / `doc.bounds.max`).

---

# Phase 5.2 — LWPOLYLINE Rendering + Camera Diagnostic

## Objective

Extend the renderer to support `LWPOLYLINE` entities, including both straight segments and curved arc segments encoded as DXF bulge values.

## LWPOLYLINE bulge → arc conversion

A DXF bulge value encodes a circular arc between two consecutive vertices. The renderer converts it mathematically:

```text
bulge = tan(θ / 4)     where θ is the arc's included angle

c = (1 - b²) / (2b)    sagitta factor
cx = midpoint.x - c * dy / 2
cy = midpoint.y + c * dx / 2
R  = hypot(x1 - cx, y1 - cy)
```

The arc is then tessellated with adaptive segmentation:

```text
segments = max(8, min(128, ceil(|angleDiff| × 15)))
```

This produces smooth arcs at normal CAD zoom levels without excessive vertex counts.

## Camera diagnostic fix

During Phase 5.2, a camera scaling bug was found:

- The orthographic frustum was not correctly accounting for the container aspect ratio.
- `fitToDrawing()` was recalculated to correctly fit the width or height depending on the drawing's own aspect ratio vs the viewport.

## Phase 5.2 result

- `LWPOLYLINE` with straight segments renders correctly.
- `LWPOLYLINE` with bulge-encoded arcs renders correctly.
- Closed polylines are handled correctly (last vertex connects back to first).
- `fitToDrawing()` correctly frames the full drawing on first load.

### Validation — F2841747.dwg (40,363 entities)

```text
LINE       : 30,361   rendered ✅
LWPOLYLINE :  2,640   rendered ✅
HATCH      :  7,362   skipped (no boundary data in JSON)
```

---

# Phase 5.3 — Navigation & UI Polish

## Objective

Implement full mouse-based CAD navigation: pan, zoom-to-cursor, resize handling, and fit-to-drawing.

## Navigation implementation

### Pan

- Uses `pointerdown` / `pointermove` / `pointerup` events.
- `setPointerCapture(pointerId)` on `pointerdown` — pan continues reliably even if the mouse moves outside the canvas (CAD-style behaviour).
- Pan delta is scaled by `baseUnitsPerPixel / camera.zoom` so geometry tracks 1:1 with the mouse at all zoom levels.

### Zoom (mouse wheel)

- `{ passive: false }` prevents browser page scrolling while the cursor is over the canvas.
- Zoom is applied to `camera.zoom` (not the frustum).
- **Zoom-to-cursor**: world coordinate under the cursor is computed before and after the zoom step; `camera.position` is offset by the delta so the geometry under the cursor remains stationary.

### Resize handling

- `ResizeObserver` tracks the container size.
- On resize, the frustum `left/right/top/bottom` is recalculated from `baseUnitsPerPixel` (established by `fitToDrawing`).
- `camera.zoom` and `camera.position` are **preserved** — resizing the browser window does not reset the user's view.

### Fit to Drawing

- Always resets `camera.zoom = 1`.
- Re-calculates the base frustum from document bounds with 10% padding.
- Updates `baseUnitsPerPixel` as the new reference for subsequent resizes.

## State added to CadRenderer

| Property | Purpose |
|----------|---------|
| `docBoundsMin` / `docBoundsMax` | Store document bounds for re-fit |
| `isDragging` | Pan state flag |
| `previousPointerPosition` | Previous mouse position for pan delta |
| `baseUnitsPerPixel` | Base world-units-per-screen-pixel at zoom = 1 |

## UI fix

- Fixed "Fit to Drawing" and "Close Viewer" button overlap using flexbox layout in `CadViewer.tsx`.

## Phase 5.3 result

- Pan works correctly at all zoom levels.
- Zoom-to-cursor works correctly.
- Browser resize preserves zoom and pan.
- Fit to Drawing fully resets the view.
- Close Viewer unmounts the renderer and frees all WebGL resources.

---

# Phase 5.4 — TEXT Entity Rendering

## Objective

Identify and implement the next renderable entity type beyond LINE and LWPOLYLINE, based on the actual entity distribution of the canonical test JSON.

## Entity analysis — canonical test JSON (165 entities)

```text
LWPOLYLINE :  68  (41.2%)  ← already rendered
LINE       :  54  (32.7%)  ← already rendered
HATCH      :  17  (10.3%)  ← cannot render, boundary paths missing from JSON
INSERT     :  15  ( 9.1%)  ← cannot render, block sub-entities missing from JSON
TEXT       :  11  ( 6.7%)  ← selected for Phase 5.4
```

HATCH and INSERT were found to have **insufficient JSON schema data** for rendering:

- HATCH: `geometry` only contains `solid_fill` and `pattern_name`. No boundary paths.
- INSERT: `geometry` has `insertionPoint`, `rotation`, `scale` but block definitions lack sub-entity geometry.

TEXT was selected as the only remaining entity type with complete renderable data.

## TEXT JSON schema

The backend emits TEXT entities in this format:

```json
{
  "id": "1CAC8",
  "type": "TEXT",
  "layer": "0",
  "style": { "color": 0, "linetype": null, "lineweight": null },
  "geometry": { "location": [356.13, 198.54, 0] },
  "text": "Client Name"
}
```

**Properties present:** `text`, `location` (x, y, z), `style.color`

**Properties missing from backend (schema gap):** `height`, `rotation`, `alignment`

## TEXT rendering approach (MVP)

- Each TEXT entity generates an offscreen HTML5 `<canvas>`.
- Text is drawn at 64px internal resolution using `sans-serif`.
- Canvas is converted to `THREE.CanvasTexture`.
- Texture is applied to a `THREE.PlaneGeometry` via `THREE.MeshBasicMaterial`.
- Plane is positioned at the CAD world coordinate — text stays anchored through zoom and pan.
- Geometry is translated so `mesh.position` corresponds to the bottom-left anchor of the text.

**Default height:** `4.0` CAD units (hardcoded — backend does not currently provide `height`).

**Scalability note:** One `CanvasTexture` per entity. For drawings with thousands of unique text strings, a texture atlas or SDF approach should replace this in a future phase.

## TypeScript schema update

```typescript
export interface CadTextEntity extends CadEntityBase {
  type: 'TEXT';
  text: string;
  geometry: {
    location: [number, number, number];
  };
}
```

## Cleanup

`CadRenderer.clearScene()` was updated to explicitly call `.dispose()` on all `CanvasTexture` instances when the viewer is closed or a new document is loaded. No WebGL texture leaks.

## Phase 5.4 result

```text
LINE       :  54 / 54   rendered ✅  100%
LWPOLYLINE :  68 / 68   rendered ✅  100%
TEXT       :  11 / 11   rendered ✅  100%
HATCH      :   0 / 17   skipped  ❌    0%  (backend schema insufficient)
INSERT     :   0 / 15   skipped  ❌    0%  (backend schema insufficient)
─────────────────────────────────────────────────────
TOTAL      : 133 / 165  rendered       80.6%
```

---

# Phase 5.4 — CORS Fix

## Root cause

`load_dotenv(BASE_DIR / '.env')` without `override=True` silently ignores `.env` values if the same environment variable was already set in the shell environment. This caused `CORS_ALLOWED_ORIGINS` to retain a stale value that excluded the frontend LAN port `5174`.

## Fix applied

```python
# backend/config/settings.py
load_dotenv(BASE_DIR / '.env', override=True)
```

Also added explicit CORS method and header declarations:

```python
CORS_ALLOW_HEADERS = list(default_headers) + ['content-disposition']
CORS_ALLOW_METHODS = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT']
```

## Development environment

All testing uses LAN IPs, not localhost:

```text
Frontend  : http://192.168.0.100:5174
Backend   : http://192.168.0.100:8000
Converter : http://192.168.0.100:8080
```

---

# Phase Completion Summary

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Project/environment and service setup | ✅ Complete |
| Phase 2 | DWG → DXF conversion pipeline | ✅ Complete |
| Phase 3 | CAD parser + API integration | ✅ Complete |
| Phase 4 | ARCOS CAD JSON generation and validation | ✅ Complete |
| Phase 5.1 | WebGL renderer foundation — LINE | ✅ Complete |
| Phase 5.2 | LWPOLYLINE rendering + camera diagnostic | ✅ Complete |
| Phase 5.3 | Pan, zoom-to-cursor, resize, fit, UI polish | ✅ Complete |
| Phase 5.4 | TEXT entity rendering (MVP) + CORS fix | ✅ Complete |
| Phase 5.5 | Backend schema expansion (HATCH, INSERT, TEXT props) | ⏳ Next |

---

# Entity Rendering Coverage (Phase 5.4)

Canonical test dataset: `parsed_cad.json`

> **Note on entity counts:** The DWG contains 184 total entities. The backend exports 165 into the `entities[]` array. The 19 missing are `IMAGE` (×16) and `OLE2FRAME` (×3) — raster-only embedded objects with no vector geometry. These are correctly excluded from the entities array. `statistics.totalEntities` reports 184 (full DWG count); `statistics.supportedEntities` reports 165 (exported to JSON).

```text
Entity Type  │ In JSON │ Rendered │ Coverage
─────────────┼─────────┼──────────┼─────────
LINE         │    54   │    54    │  100%
LWPOLYLINE   │    68   │    68    │  100%
TEXT         │    11   │    11    │  100%
HATCH        │    17   │     0    │    0%   ← needs backend boundary path export
INSERT       │    15   │     0    │    0%   ← needs backend block sub-entity export
─────────────┼─────────┼──────────┼─────────
TOTAL        │   165   │   133    │  80.6%
```

---

# Important Test Artifacts

| File | Description |
|------|-------------|
| `F2841747_parsed.json` | Large production DWG (40,363 entities) — LINE + LWPOLYLINE + HATCH |
| `parsed_cad.json` | Canonical test JSON (165 entities) — all 5 entity types present |

Generate `parsed_cad.json` from a DWG:

```powershell
curl.exe -X POST "http://192.168.0.100:8000/api/cad/parse/" -F "file=@C:\Users\kousi\Downloads\YourFile.dwg" --output "parsed_cad.json"
```

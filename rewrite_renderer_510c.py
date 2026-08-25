import re

filepath = r"e:\viewer_v2\arcos-cad\frontend\src\cad\renderer\CadRenderer.ts"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Update stats
code = code.replace(
    "splineSegments: 0",
    "splineSegments: 0, renderedCircles: 0, renderedArcs: 0, renderedEllipses: 0, renderedPoints: 0"
)

# Update log
code = code.replace(
    "Unsupported SPLINEs: ${aggregatedStats.unsupportedSplines}",
    "Unsupported SPLINEs: ${aggregatedStats.unsupportedSplines}\nCIRCLE Processed: ${aggregatedStats.renderedCircles}\nARC Processed: ${aggregatedStats.renderedArcs}\nELLIPSE Processed: ${aggregatedStats.renderedEllipses}\nPOINT Processed: ${aggregatedStats.renderedPoints}"
)

# Add logic for CIRCLE, ARC, ELLIPSE, POINT
new_branches = """
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
"""

code = code.replace("else if (entity.type === 'HATCH') {", new_branches + "\n      else if (entity.type === 'HATCH') {")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(code)

print("Rewrite 5.10c complete")

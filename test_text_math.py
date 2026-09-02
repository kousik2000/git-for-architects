import math

def investigate_threejs_text(halign, valign, defaultCadHeight, text_str="Test"):
    fontSize = 64
    canvas_height = fontSize + 12
    # canvas width doesn't matter for Y calculation
    
    aspect = 1.0 # arbitrary
    planeHeight = defaultCadHeight * (canvas_height / fontSize)
    
    # In threejs, PlaneGeometry goes from -W/2 to W/2, -H/2 to H/2.
    transY = planeHeight / 2 # default (baseline/bottom)
    if valign == 1: transY = planeHeight / 2
    if valign == 2: transY = 0
    if valign == 3: transY = -planeHeight / 2
    
    # After geometry.translate(transX, transY, 0)
    # The new Y range is (-H/2 + transY, H/2 + transY)
    # If valign == 1: (-H/2 + H/2, H/2 + H/2) = (0, H)
    # The reference point is 0.
    
    # But inside the canvas (which maps 0..H to texture):
    # The baseline drawY is:
    drawY = canvas_height - 6 # for bottom / baseline
    if valign == 2: drawY = canvas_height / 2
    if valign == 3: drawY = 2
    
    print(f"valign {valign}: planeHeight={planeHeight} (expected {defaultCadHeight})")
    # Where does the baseline land relative to 0?
    # In canvas coords (0 at top, canvas_height at bottom)
    # texture V coord goes from 0 (bottom) to 1 (top).
    v_baseline = 1.0 - (drawY / canvas_height)
    
    # Y coordinate on the plane for the baseline:
    # y = Y_bottom_of_plane + v_baseline * planeHeight
    y_bottom = -planeHeight/2 + transY
    y_baseline = y_bottom + v_baseline * planeHeight
    
    print(f"  Baseline Y offset relative to insertion point: {y_baseline}")
    print(f"  Ratio drawn height / cad height: {planeHeight / defaultCadHeight}")

investigate_threejs_text(0, 0, 10.0) # Baseline
investigate_threejs_text(0, 1, 10.0) # Bottom
investigate_threejs_text(0, 2, 10.0) # Middle
investigate_threejs_text(0, 3, 10.0) # Top

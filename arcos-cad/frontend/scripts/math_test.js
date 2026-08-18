function testBulge(x1, y1, x2, y2, b) {
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
    
    console.log(`Test: (${x1},${y1}) to (${x2},${y2}) bulge=${b}`);
    console.log(`  Center: (${cx.toFixed(2)}, ${cy.toFixed(2)})`);
    console.log(`  Radius: ${R.toFixed(2)}`);
    console.log(`  Angles: ${(startAngle*180/Math.PI).toFixed(2)} to ${(endAngle*180/Math.PI).toFixed(2)}`);
    console.log(`  Diff: ${(angleDiff*180/Math.PI).toFixed(2)} deg`);
    console.log(`  Segments: ${segments}`);
    
    let lastX = x1;
    let lastY = y1;
    for (let j = 1; j <= segments; j++) {
        const isLast = j === segments;
        const currentAngle = startAngle + step * j;
        const currX = isLast ? x2 : cx + R * Math.cos(currentAngle);
        const currY = isLast ? y2 : cy + R * Math.sin(currentAngle);
        lastX = currX;
        lastY = currY;
    }
    console.log(`  End point diff: dx=${Math.abs(lastX - x2)}, dy=${Math.abs(lastY - y2)}`);
}

testBulge(100, 0, 0, 0, 0.5); // synthetic curved test reversed? The test was (100,0) to (100,100) bulge=0.5
testBulge(100, 0, 100, 100, 0.5);
testBulge(0, 0, 100, 0, -0.41421356);

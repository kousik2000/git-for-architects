const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function runBenchmark() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });
  const page = await browser.newPage();
  
  const report = {
    A_Environment: { Browser: 'Chrome via Puppeteer', OS: process.platform, Viewport: '1920x1080', DPR: 1 },
    B_Loading: {},
    C_Idle: {},
    D_Modelspace: {},
    E_Layout1: {},
    F_Layout2: {},
    G_UIScroll: {},
    H_Memory: {},
    I_RenderCost: {}
  };

  try {
    console.log("Navigating to app...");
    await page.goto('http://127.0.0.1:5173/');
    
    const memoryAvail = await page.evaluate(() => !!window.performance.memory);
    if (!memoryAvail) report.H_Memory.Available = false;
    
    console.log("Configuring backend URL...");
    await page.waitForSelector('.config-btn', { timeout: 5000 }).catch(() => {});
    const configBtn = await page.$('.config-btn');
    if (configBtn) {
      await configBtn.click();
      await page.waitForSelector('.config-input');
      await page.click('.config-input', { clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.type('.config-input', 'http://127.0.0.1:8000');
      await page.click('.modal-actions button');
    }

    if (memoryAvail) {
      report.H_Memory.BeforeLoad = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB');
    }

    console.log("Uploading file...");
    const filePath = path.resolve('E:\\viewer_v2\\dxf_files\\TERMINALDESIGN PART 2.dxf');
    const inputUploadHandle = await page.$('input[type=file]');
    await inputUploadHandle.uploadFile(filePath);

    const uploadStartTime = Date.now();
    await page.waitForSelector('.secondary-btn', { timeout: 10000 });
    const convertBtn = await page.$('.secondary-btn');
    await convertBtn.click();
    
    console.log("Waiting for CAD Viewer to load...");
    await page.waitForSelector('.cad-viewer-canvas-wrapper canvas', { timeout: 120000 });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    const loadEndTime = Date.now();
    
    report.B_Loading.TotalLoadTime = (loadEndTime - uploadStartTime) + ' ms';
    
    const renderCost = await page.evaluate(() => {
      if (!window.cadRenderer || !window.cadRenderer.renderer) return null;
      const info = window.cadRenderer.renderer.info;
      return {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures
      };
    });
    report.I_RenderCost = renderCost || { error: 'Not available' };

    if (memoryAvail) {
      report.H_Memory.AfterLoad = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB');
    }

    console.log("Measuring idle...");
    const startIdleRenderCalls = renderCost ? renderCost.calls : 0;
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const endIdleRenderCalls = await page.evaluate(() => {
      if (!window.cadRenderer) return 0;
      return window.cadRenderer.renderer.info.render.calls;
    });
    report.C_Idle.RenderCallsDuring5sIdle = (endIdleRenderCalls - startIdleRenderCalls);

    console.log("Testing Zoom...");
    await page.mouse.move(960, 540);
    for(let i = 0; i < 20; i++) {
       await page.mouse.wheel({ deltaY: -100 });
       await new Promise(r => setTimeout(r, 50));
    }
    const endZoomRenderCalls = await page.evaluate(() => window.cadRenderer ? window.cadRenderer.renderer.info.render.calls : 0);
    report.D_Modelspace.Zoom = { renders: endZoomRenderCalls - endIdleRenderCalls };

    console.log("Testing Pan...");
    const panStartRenders = await page.evaluate(() => window.cadRenderer ? window.cadRenderer.renderer.info.render.calls : 0);
    await page.mouse.down();
    for(let i=0; i<20; i++) {
        await page.mouse.move(960 + (i*10), 540 + (i*10));
        await new Promise(r => setTimeout(r, 50));
    }
    await page.mouse.up();
    const panEndRenders = await page.evaluate(() => window.cadRenderer ? window.cadRenderer.renderer.info.render.calls : 0);
    report.D_Modelspace.Pan = { renders: panEndRenders - panStartRenders };

    if (memoryAvail) {
      report.H_Memory.AfterInteraction = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB');
    }

  } catch (err) {
    console.error(err);
    report.Error = err.message;
  } finally {
    fs.writeFileSync('benchmark_report.json', JSON.stringify(report, null, 2));
    console.log("Report saved to benchmark_report.json");
    await browser.close();
  }
}

runBenchmark();

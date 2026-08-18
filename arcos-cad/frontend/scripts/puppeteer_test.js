const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    try {
        const browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
        
        await page.goto('http://192.168.0.100:5174');
        
        // Wait for file input
        await page.waitForSelector('input[type=file]');
        const inputUploadHandle = await page.$('input[type=file]');
        
        // Upload JSON file
        const fileToUpload = 'e:\\viewer_v2\\parsed_cad_phase5_5.json';
        await inputUploadHandle.uploadFile(fileToUpload);
        
        // Click View CAD button
        await page.waitForSelector('button.secondary-btn');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const viewBtn = btns.find(b => b.textContent.includes('View CAD'));
            if (viewBtn) viewBtn.click();
        });
        
        // Wait for canvas or 5 seconds
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot
        await page.screenshot({ path: 'e:\\viewer_v2\\hatch_verification.png', fullPage: true });
        console.log('Screenshot saved to hatch_verification.png');
        
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();

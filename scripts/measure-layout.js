/* Measure layout overflow on the dev preview page at iPhone size. */
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const theme = process.argv[2] || 'parlor';
  await page.goto(`http://localhost:3000/dev/table?theme=${theme}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1200));

  const report = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = {
      viewport: vw,
      docScrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      docScrollH: document.documentElement.scrollHeight,
      innerH: window.innerHeight,
      felt: null,
      wide: [],
    };
    const felt = document.querySelector('.table-felt');
    if (felt) {
      const r = felt.getBoundingClientRect();
      out.felt = { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
    }
    // find elements extending past the right edge of the viewport
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        out.wide.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 70),
          left: Math.round(r.left),
          right: Math.round(r.right),
          w: Math.round(r.width),
        });
      }
      if (out.wide.length > 25) break;
    }
    return out;
  });
  console.log(JSON.stringify(report, null, 1));
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-hiper2d-projects-poker-with-ai/ae6a9f50-6be3-492f-b11f-f31d1102ff77/scratchpad/measure-${theme}.png` });
  await browser.close();
})();

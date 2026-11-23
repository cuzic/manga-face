import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-chromium';

const directory = process.argv[2];
if (!directory) throw new Error('Provide the directory created by landmark_calibration.py generate.');
const names = (await readdir(directory)).filter(name => name.endsWith('.svg')).sort();
if (names.length === 0) throw new Error('The fixture directory contains no SVG files.');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 408, height: 408}, deviceScaleFactor: 1});
  for (const name of names) {
    const svg = await readFile(path.join(directory, name), 'utf8');
    await page.setContent('<style>body{margin:0}svg{display:block}</style>' + svg);
    await page.screenshot({path: path.join(directory, name.replace(/\.svg$/, '.png'))});
  }
} finally {
  await browser.close();
}

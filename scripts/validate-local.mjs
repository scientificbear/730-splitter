/**
 * Local-only regression against real test_data/ (gitignored).
 * Run: npm run test:local
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadApp } from '../tests/setup-dom.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const inputPath = join(root, 'test_data/input/MOD7304_S000_260616_001.rel');
const expectedDir = join(root, 'test_data/output');

if (!existsSync(inputPath) || !existsSync(expectedDir)) {
  console.log('Skipping local regression: test_data/ not found (expected on developer machine only).');
  process.exit(0);
}

const { splitRelFile } = loadApp();

const xmlText = readFileSync(inputPath, 'utf8');
const result = splitRelFile(xmlText);

const expectedFiles = readdirSync(expectedDir).filter((f) => f.endsWith('.rel')).sort();
const actualFiles = [...result.keys()].sort();

console.log('File count:', actualFiles.length, '(expected', expectedFiles.length, ')');

const missing = expectedFiles.filter((f) => !result.has(f));
const extra = actualFiles.filter((f) => !expectedFiles.includes(f));

if (missing.length) {
  console.error('Missing files:', missing);
}
if (extra.length) {
  console.error('Extra files:', extra);
}

let failed = missing.length + extra.length;

for (const filename of expectedFiles) {
  if (!result.has(filename)) {
    continue;
  }

  const expectedXml = readFileSync(join(expectedDir, filename), 'utf8');
  const expectedMatch = expectedXml.match(/<m730:TotaleDocumenti>(\d+)<\/m730:TotaleDocumenti>/);
  const actualMatch = result.get(filename).match(/<m730:TotaleDocumenti>(\d+)<\/m730:TotaleDocumenti>/);

  const expectedTot = expectedMatch ? expectedMatch[1] : '?';
  const actualTot = actualMatch ? actualMatch[1] : '?';

  const docCount = (result.get(filename).match(/<m730:Documento_730-4/g) || []).length;

  if (expectedTot !== actualTot || String(docCount) !== actualTot) {
    console.error(`${filename}: TotaleDocumenti=${actualTot} (expected ${expectedTot}), docs=${docCount}`);
    failed++;
  } else {
    console.log(`OK ${filename}: TotaleDocumenti=${actualTot}, docs=${docCount}`);
  }
}

if (failed > 0) {
  console.error(`\nValidation FAILED (${failed} issue(s))`);
  process.exit(1);
}

console.log('\nValidation PASSED');

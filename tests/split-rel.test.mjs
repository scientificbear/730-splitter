import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './setup-dom.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

const { splitRelFile, basenameWithoutExt } = loadApp();

function readFixture(name) {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

function totaleDocumenti(xml) {
  return xml.match(/<m730:TotaleDocumenti>(\d+)<\/m730:TotaleDocumenti>/)?.[1];
}

function documentoCount(xml) {
  return (xml.match(/<m730:Documento_730-4/g) || []).length;
}

describe('splitRelFile', () => {
  it('splits two-companies.rel into two files with correct names', () => {
    const result = splitRelFile(readFixture('two-companies.rel'));

    assert.equal(result.size, 2);
    assert.ok(result.has('00000000001_AZIENDA ALPHA SRL.rel'));
    assert.ok(result.has('00000000002_BETA & CO SRL.rel'));
  });

  it('groups multiple documents for the same company', () => {
    const result = splitRelFile(readFixture('two-companies.rel'));
    const alphaXml = result.get('00000000001_AZIENDA ALPHA SRL.rel');

    assert.equal(totaleDocumenti(alphaXml), '2');
    assert.equal(documentoCount(alphaXml), 2);
  });

  it('keeps a single document for a one-doc company', () => {
    const result = splitRelFile(readFixture('two-companies.rel'));
    const betaXml = result.get('00000000002_BETA & CO SRL.rel');

    assert.equal(totaleDocumenti(betaXml), '1');
    assert.equal(documentoCount(betaXml), 1);
  });

  it('uses Cognome for PF sostituto naming', () => {
    const result = splitRelFile(readFixture('pf-sostituto.rel'));

    assert.equal(result.size, 1);
    assert.ok(result.has('00000000099_ROSSI.rel'));
    assert.equal(totaleDocumenti(result.get('00000000099_ROSSI.rel')), '1');
  });

  it('rejects invalid XML', () => {
    assert.throws(() => splitRelFile('not xml'), /File XML non valido/);
  });

  it('rejects wrong root element', () => {
    const xml = '<?xml version="1.0"?><root></root>';
    assert.throws(() => splitRelFile(xml), /Formato file non riconosciuto/);
  });

  it('rejects file with no Sostituto entries', () => {
    const xml = `<?xml version="1.0"?>
<m730:Fornitura730-4 xmlns:m730="urn:www.agenziaentrate.gov.it:specificheTecniche:sco:730">
  <m730:Intestazione>
    <m730:TotaleDocumenti>0</m730:TotaleDocumenti>
  </m730:Intestazione>
</m730:Fornitura730-4>`;
    assert.throws(() => splitRelFile(xml), /Nessuna azienda/);
  });
});

describe('basenameWithoutExt', () => {
  it('strips path and extension', () => {
    assert.equal(basenameWithoutExt('folder/MOD7304.rel'), 'MOD7304');
    assert.equal(basenameWithoutExt('file.rel'), 'file');
  });
});

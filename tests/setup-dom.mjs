import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

global.DOMParser = DOMParser;
global.XMLSerializer = XMLSerializer;
global.document = { addEventListener: () => {} };

const require = createRequire(import.meta.url);

export function loadApp() {
  return require(join(root, 'app.js'));
}

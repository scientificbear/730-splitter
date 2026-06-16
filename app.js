const NS_M730 = 'urn:www.agenziaentrate.gov.it:specificheTecniche:sco:730';

function elementChildren(parent) {
  return Array.from(parent.childNodes).filter((node) => node.nodeType === 1);
}

function getParseError(doc) {
  if (doc.querySelector) {
    return doc.querySelector('parsererror');
  }
  const errors = doc.getElementsByTagName('parsererror');
  return errors.length > 0 ? errors[0] : null;
}

function firstChildNS(parent, ns, localName) {
  for (const child of elementChildren(parent)) {
    if (child.namespaceURI === ns && child.localName === localName) {
      return child;
    }
  }
  return null;
}

function getSostitutoKeyFromSostituto(sostituto) {
  const cf = firstChildNS(sostituto, NS_M730, 'CodiceFiscale');
  if (!cf || !cf.textContent) {
    return null;
  }

  const datiPf = firstChildNS(sostituto, NS_M730, 'DatiAnagraficiPF');
  if (datiPf) {
    const cognome = firstChildNS(datiPf, NS_M730, 'Cognome');
    if (cognome && cognome.textContent) {
      return `${cf.textContent}_${cognome.textContent}`;
    }
  }

  const denominazione = firstChildNS(sostituto, NS_M730, 'DenominazionePNF');
  if (denominazione && denominazione.textContent) {
    return `${cf.textContent}_${denominazione.textContent}`;
  }

  return null;
}

function getSostitutoKeyFromDocumento(documento) {
  const sostituto = firstChildNS(documento, NS_M730, 'Sostituto');
  if (!sostituto) {
    return null;
  }
  return getSostitutoKeyFromSostituto(sostituto);
}

function getDocumenti730(root) {
  const documenti = [];
  for (const child of elementChildren(root)) {
    if (child.namespaceURI === NS_M730 && child.localName === 'Documento_730-4') {
      documenti.push(child);
    }
  }
  return documenti;
}

function serializeDocument(doc) {
  const xml = new XMLSerializer().serializeToString(doc);
  if (xml.startsWith('<?xml')) {
    return xml;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

/**
 * Split a 730-4 .rel file into one file per Sostituto (company).
 * @param {string} xmlText
 * @returns {Map<string, string>} filename -> XML content
 */
function splitRelFile(xmlText) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  } catch {
    throw new Error('File XML non valido.');
  }
  const parseError = getParseError(doc);
  if (parseError) {
    throw new Error('File XML non valido.');
  }

  const root = doc.documentElement;
  if (!root || root.localName !== 'Fornitura730-4') {
    throw new Error('Formato file non riconosciuto: atteso Fornitura730-4.');
  }

  const aziende = [];
  for (const documento of getDocumenti730(root)) {
    const sostituto = firstChildNS(documento, NS_M730, 'Sostituto');
    if (!sostituto) {
      continue;
    }
    const key = getSostitutoKeyFromSostituto(sostituto);
    if (key) {
      aziende.push(key);
    }
  }

  const uniqueAziende = [...new Set(aziende)];
  if (uniqueAziende.length === 0) {
    throw new Error('Nessuna azienda (Sostituto) trovata nel file.');
  }

  const output = new Map();

  for (const singolo of uniqueAziende) {
    const clonedDoc = doc.cloneNode(true);
    const rootOutput = clonedDoc.documentElement;

    for (const blocco of getDocumenti730(rootOutput)) {
      const key = getSostitutoKeyFromDocumento(blocco);
      if (key !== singolo) {
        rootOutput.removeChild(blocco);
      }
    }

    const remaining = getDocumenti730(rootOutput);
    const intestazione = firstChildNS(rootOutput, NS_M730, 'Intestazione');
    if (intestazione) {
      const totale = firstChildNS(intestazione, NS_M730, 'TotaleDocumenti');
      if (totale) {
        totale.textContent = String(remaining.length);
      }
    }

    output.set(`${singolo}.rel`, serializeDocument(clonedDoc));
  }

  return output;
}

function basenameWithoutExt(filename) {
  const base = filename.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

async function buildZip(files, zipName) {
  const zip = new JSZip();
  for (const [name, content] of files) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: 'blob' });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input');
  const processBtn = document.getElementById('process-btn');
  const downloadBtn = document.getElementById('download-btn');
  const clearBtn = document.getElementById('clear-btn');
  const statusEl = document.getElementById('status');
  const fileNameEl = document.getElementById('file-name');
  const resultsEl = document.getElementById('results');
  const resultsHeadingEl = document.getElementById('results-heading');
  const resultsListEl = document.getElementById('results-list');

  let selectedFile = null;
  let resultFiles = null;
  let zipBlob = null;
  let zipFilename = 'output.zip';

  function setStatus(message, type = 'info') {
    statusEl.textContent = message;
    statusEl.dataset.type = type;
  }

  function resetResults() {
    resultFiles = null;
    zipBlob = null;
    downloadBtn.hidden = true;
    clearBtn.hidden = true;
    resultsEl.hidden = true;
    resultsHeadingEl.textContent = '';
    resultsListEl.replaceChildren();
  }

  function resetAll() {
    selectedFile = null;
    fileInput.value = '';
    fileNameEl.textContent = '';
    processBtn.disabled = true;
    resetResults();
    setStatus('');
  }

  function showResults(companyNames) {
    const sorted = [...companyNames].sort((a, b) => a.localeCompare(b, 'it'));
    resultsHeadingEl.textContent = `Ho trovato le seguenti ${sorted.length} aziende:`;
    resultsListEl.replaceChildren(
      ...sorted.map((name) => {
        const li = document.createElement('li');
        li.textContent = name;
        return li;
      }),
    );
    resultsEl.hidden = false;
  }

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files[0] || null;
    resetResults();

    if (selectedFile) {
      fileNameEl.textContent = selectedFile.name;
      processBtn.disabled = false;
      setStatus('File selezionato. Clicca "Elabora" per procedere.');
    } else {
      fileNameEl.textContent = '';
      processBtn.disabled = true;
      setStatus('');
    }
  });

  processBtn.addEventListener('click', async () => {
    if (!selectedFile) {
      return;
    }

    processBtn.disabled = true;
    downloadBtn.hidden = true;
    clearBtn.hidden = true;
    resultsEl.hidden = true;
    setStatus('Elaborazione in corso…');

    try {
      const xmlText = await selectedFile.text();
      resultFiles = splitRelFile(xmlText);
      zipFilename = `${basenameWithoutExt(selectedFile.name)}_output.zip`;

      zipBlob = await buildZip(resultFiles, zipFilename);
      downloadBtn.hidden = false;
      clearBtn.hidden = false;
      showResults([...resultFiles.keys()].map((filename) => filename.replace(/\.rel$/, '')));
      setStatus('');
    } catch (err) {
      resetResults();
      setStatus(err.message || 'Errore durante l\'elaborazione.', 'error');
    } finally {
      processBtn.disabled = !selectedFile;
    }
  });

  downloadBtn.addEventListener('click', () => {
    if (zipBlob) {
      triggerDownload(zipBlob, zipFilename);
    }
  });

  clearBtn.addEventListener('click', resetAll);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    splitRelFile,
    basenameWithoutExt,
    NS_M730,
    getDocumenti730,
    getSostitutoKeyFromDocumento,
  };
}

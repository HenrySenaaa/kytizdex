const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

/**
 * Carrega o index.html no jsdom executando os scripts locais em ordem,
 * como o navegador faria. `beforeParse` permite injetar mocks (fetch, Date...).
 */
function loadPage({ beforeParse, storage } = {}) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    return `<script>${code}\n</script>`;
  });
  // Folhas de estilo/fontes externas não interessam aos testes.
  html = html.replace(/<link[^>]+>/g, '');

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      if (storage) {
        Object.entries(storage).forEach(([k, v]) => window.localStorage.setItem(k, v));
      }
      if (beforeParse) beforeParse(window);
    }
  });
  return dom;
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

module.exports = { loadPage, tick };

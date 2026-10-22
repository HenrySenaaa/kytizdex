const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, tick } = require('./helpers');

const fixtures = {
  season: require('./fixtures/season.json'),
  search: require('./fixtures/search.json'),
  details: require('./fixtures/details.json')
};

/** Abre a página com um fetch falso que responde com dados reais salvos da API. */
function setup({ fail = false } = {}) {
  const requests = [];
  const dom = loadPage({
    beforeParse(window) {
      window.fetch = (url) => {
        requests.push(decodeURIComponent(url));
        if (fail) return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
        let body = fixtures.search;
        if (/\/anime\/\d+\?/.test(url)) body = fixtures.details;
        else if (url.includes('filter%5Bseason%5D')) body = fixtures.season;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });
      };
    }
  });
  const w = dom.window;
  const doc = w.document;
  return { w, doc, $: (id) => doc.getElementById(id), requests, close: () => w.close() };
}

function type(w, input, value) {
  input.value = value;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
}

test('tela inicial carrega os destaques da temporada em cards', async (t) => {
  const { doc, $, requests, close } = setup();
  t.after(close);
  assert.ok(doc.querySelector('.card--skeleton'), 'mostra skeleton enquanto carrega');
  await tick(20);

  assert.match(requests[0], /filter\[season\]=/);
  const cards = doc.querySelectorAll('.card[data-id]');
  assert.equal(cards.length, fixtures.season.data.length);
  const first = cards[0];
  assert.ok(first.querySelector('img').src.startsWith('https://'), 'card tem a capa');
  assert.ok(first.querySelector('.card__title').textContent.length > 0, 'card tem título');
  assert.ok(first.querySelector('.card__desc').textContent.length > 0, 'card tem descrição');
  assert.equal($('results-title').textContent, '🔥 Destaques da temporada');
  assert.equal($('load-more').hidden, false);
});

test('digitar na busca faz fetch com debounce e renderiza os resultados', async (t) => {
  const { w, doc, $, requests, close } = setup();
  t.after(close);
  await tick(20);
  const before = requests.length;

  type(w, $('search'), 'n');
  type(w, $('search'), 'na');
  type(w, $('search'), 'naruto');
  await tick(100);
  assert.equal(requests.length, before, 'ainda não buscou (debounce)');
  await tick(450);

  assert.equal(requests.length, before + 1, 'uma única requisição para 3 teclas');
  assert.match(requests.at(-1), /filter\[text\]=naruto/);
  assert.equal($('results-title').textContent, 'Resultados para "naruto"');
  assert.match($('results-meta').textContent, /37 títulos encontrados/);
  assert.match(doc.querySelector('.card__title').textContent, /Naruto/);
});

test('Enter busca imediatamente', async (t) => {
  const { w, $, requests, close } = setup();
  t.after(close);
  await tick(20);
  $('search').value = 'frieren';
  $('search-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(requests.at(-1), /filter\[text\]=frieren/);
});

test('menu lateral de gêneros filtra por categoria', async (t) => {
  const { doc, $, requests, close } = setup();
  t.after(close);
  await tick(20);
  const action = doc.querySelector('[data-category="action"]');
  action.click();
  await tick(20);
  assert.match(requests.at(-1), /filter\[categories\]=action/);
  assert.equal(doc.querySelector('[data-category="action"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('results-title').textContent, 'Ação');
});

test('selects de formato e ordenação refazem a busca', async (t) => {
  const { w, $, requests, close } = setup();
  t.after(close);
  await tick(20);
  $('subtype').value = 'movie';
  $('subtype').dispatchEvent(new w.Event('change'));
  assert.match(requests.at(-1), /filter\[subtype\]=movie/);
  $('sort').value = 'rating';
  $('sort').dispatchEvent(new w.Event('change'));
  assert.match(requests.at(-1), /sort=-averageRating/);
});

test('Carregar mais busca a próxima página e acrescenta cards', async (t) => {
  const { doc, $, requests, close } = setup();
  t.after(close);
  await tick(20);
  const count = doc.querySelectorAll('.card[data-id]').length;
  $('load-more').click();
  await tick(20);
  assert.match(requests.at(-1), new RegExp(`page\\[offset\\]=${count}`));
  assert.equal(doc.querySelectorAll('.card[data-id]').length, count * 2);
});

test('clicar no card abre o modal com detalhes sem recarregar a página', async (t) => {
  const { w, doc, $, requests, close } = setup();
  t.after(close);
  await tick(20);
  const url = w.location.href;

  doc.querySelector('.card[data-id]').click();
  assert.equal($('modal').hidden, false);
  assert.ok(doc.querySelector('.spinner'), 'mostra carregamento');
  await tick(20);

  assert.match(requests.at(-1), /\/anime\/\d+\?include=categories/);
  assert.equal($('modal-title').textContent, 'Attack on Titan');
  const info = [...doc.querySelectorAll('.info')].map((i) => i.textContent);
  assert.ok(info.some((t) => /Nota★ \d\.\d \/ 10/.test(t)), 'mostra a nota');
  assert.ok(info.some((t) => t === 'Lançamento2013'), 'mostra o ano');
  assert.ok(doc.querySelector('.detail__synopsis').textContent.length > 100, 'mostra a sinopse');
  assert.ok(doc.querySelectorAll('.tag').length > 0, 'mostra gêneros');
  assert.equal(w.location.href, url);
});

test('modal fecha com Esc, botão X e clique fora', async (t) => {
  const { w, doc, $, close } = setup();
  t.after(close);
  await tick(20);
  const open = async () => { doc.querySelector('.card[data-id]').click(); await tick(10); };

  await open();
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal($('modal').hidden, true);

  await open();
  doc.querySelector('.modal__close').click();
  assert.equal($('modal').hidden, true);

  await open();
  doc.querySelector('.modal__overlay').click();
  assert.equal($('modal').hidden, true);
  assert.equal(doc.body.classList.contains('modal-open'), false);
});

test('erro da API mostra mensagem e botão de tentar novamente', async (t) => {
  const { doc, $, requests, close } = setup({ fail: true });
  t.after(close);
  await tick(20);
  assert.match($('status').textContent, /Erro ao buscar os animes/);
  assert.equal(doc.querySelectorAll('.card').length, 0);
  const before = requests.length;
  $('status').querySelector('button').click();
  assert.equal(requests.length, before + 1);
});

test('busca sem resultados mostra estado vazio', async (t) => {
  const { w, $, close } = setup();
  t.after(close);
  await tick(20);
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [], meta: { count: 0 }, links: {} }) });
  $('search').value = 'zzzzzz';
  $('search-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(20);
  assert.match($('status').textContent, /Nenhum anime encontrado/);
  assert.equal($('load-more').hidden, true);
});

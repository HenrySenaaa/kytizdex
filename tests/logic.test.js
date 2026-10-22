const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const search = require('./fixtures/search.json');
const details = require('./fixtures/details.json');

const params = (url) => Object.fromEntries(new URL(url).searchParams);

test('buildListUrl sem filtros ordena por popularidade', () => {
  const url = L.buildListUrl({});
  assert.ok(url.startsWith('https://kitsu.app/api/edge/anime?'));
  assert.deepEqual(params(url), { 'page[limit]': '20', 'page[offset]': '0', sort: 'popularityRank' });
});

test('buildListUrl com busca, gênero, formato e paginação', () => {
  const url = L.buildListUrl({ query: '  one piece ', category: 'action', subtype: 'TV', sort: 'rating', offset: 40 });
  const p = params(url);
  assert.equal(p['filter[text]'], 'one piece');
  assert.equal(p['filter[categories]'], 'action');
  assert.equal(p['filter[subtype]'], 'TV');
  assert.equal(p['page[offset]'], '40');
  assert.equal(p.sort, undefined, 'busca por texto usa a relevância da API');
});

test('buildListUrl aplica a ordenação escolhida quando não há texto', () => {
  assert.equal(params(L.buildListUrl({ sort: 'rating' })).sort, '-averageRating');
  assert.equal(params(L.buildListUrl({ sort: 'recent' })).sort, '-startDate');
  assert.equal(params(L.buildListUrl({ sort: 'xpto' })).sort, 'popularityRank');
});

test('buildListUrl filtra por temporada', () => {
  const p = params(L.buildListUrl({ season: 'fall', seasonYear: 2026 }));
  assert.equal(p['filter[season]'], 'fall');
  assert.equal(p['filter[seasonYear]'], '2026');
});

test('currentSeason segue o calendário de temporadas de anime', () => {
  assert.deepEqual(L.currentSeason(new Date(2026, 0, 10)), { season: 'winter', year: 2026, label: 'Inverno 2026' });
  assert.equal(L.currentSeason(new Date(2026, 4, 1)).season, 'spring');
  assert.equal(L.currentSeason(new Date(2026, 7, 1)).season, 'summer');
  assert.equal(L.currentSeason(new Date(2026, 9, 21)).label, 'Outono 2026');
});

test('buildDetailsUrl inclui os gêneros e escapa o id', () => {
  const url = L.buildDetailsUrl('7442');
  assert.match(url, /\/anime\/7442\?/);
  assert.equal(params(url).include, 'categories');
  assert.match(L.buildDetailsUrl('1/../x'), /\/anime\/1%2F\.\.%2Fx\?/);
});

test('toRating converte 0-100 para 0-10', () => {
  assert.equal(L.toRating('84.07'), 8.4);
  assert.equal(L.toRating('79.96'), 8);
  assert.equal(L.toRating(null), null);
  assert.equal(L.toRating(''), null);
});

test('yearOf extrai o ano da data', () => {
  assert.equal(L.yearOf('2013-04-07'), 2013);
  assert.equal(L.yearOf(null), null);
});

test('parseListResponse normaliza a resposta real da API', () => {
  const page = L.parseListResponse(search);
  assert.equal(page.items.length, search.data.length);
  assert.equal(page.total, search.meta.count);
  assert.equal(page.hasMore, true);
  const first = page.items[0];
  assert.equal(typeof first.id, 'string');
  assert.ok(first.title.length > 0);
  assert.match(first.poster, /^https:\/\//);
  assert.equal(typeof first.rating, 'number');
  assert.equal(typeof first.year, 'number');
  assert.ok(['Série', 'Filme', 'OVA', 'ONA', 'Especial'].includes(first.type));
});

test('normalizeAnime lê detalhes com gêneros incluídos', () => {
  const anime = L.normalizeAnime(details.data, details.included);
  assert.equal(anime.id, '7442');
  assert.equal(anime.title, 'Attack on Titan');
  assert.ok(anime.genres.length > 0);
  assert.ok(anime.genres.every((g) => typeof g === 'string'));
  assert.equal(anime.year, 2013);
  assert.equal(anime.status, 'Finalizado');
  assert.doesNotMatch(anime.synopsis, /\(Source:/, 'remove a nota de fonte do fim da sinopse');
  assert.match(anime.trailer, /^https:\/\/www\.youtube\.com\/watch\?v=/);
});

test('normalizeAnime tolera campos ausentes', () => {
  const anime = L.normalizeAnime({ id: 1, attributes: {} }, []);
  assert.equal(anime.title, 'Sem título');
  assert.equal(anime.poster, '');
  assert.equal(anime.rating, null);
  assert.deepEqual(anime.genres, []);
});

test('truncate corta em palavra inteira com reticências', () => {
  assert.equal(L.truncate('curto', 10), 'curto');
  assert.equal(L.truncate('um texto bem comprido para cortar', 15), 'um texto bem…');
  assert.equal(L.truncate('', 5), '');
});

test('debounce executa só a última chamada', async () => {
  const calls = [];
  const fn = L.debounce((v) => calls.push(v), 30);
  fn(1); fn(2); fn(3);
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, [3]);
  fn(4); fn.cancel();
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, [3]);
});

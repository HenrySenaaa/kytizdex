/**
 * Funções puras do catálogo: montagem de URLs da API Kitsu,
 * normalização dos dados e utilitários. Sem acesso ao DOM.
 * Documentação da API: https://kitsu.docs.apiary.io
 */
var CatalogLogic = (function () {
  'use strict';

  var API_BASE = 'https://kitsu.app/api/edge';
  var PAGE_SIZE = 20;

  var CATEGORIES = [
    { slug: 'action', label: 'Ação' },
    { slug: 'adventure', label: 'Aventura' },
    { slug: 'comedy', label: 'Comédia' },
    { slug: 'drama', label: 'Drama' },
    { slug: 'fantasy', label: 'Fantasia' },
    { slug: 'science-fiction', label: 'Ficção científica' },
    { slug: 'horror', label: 'Terror' },
    { slug: 'mystery', label: 'Mistério' },
    { slug: 'psychological', label: 'Psicológico' },
    { slug: 'romance', label: 'Romance' },
    { slug: 'slice-of-life', label: 'Slice of Life' },
    { slug: 'sports', label: 'Esportes' },
    { slug: 'supernatural', label: 'Sobrenatural' },
    { slug: 'mecha', label: 'Mecha' },
    { slug: 'music', label: 'Música' }
  ];

  var SUBTYPES = { TV: 'Série', movie: 'Filme', OVA: 'OVA', ONA: 'ONA', special: 'Especial', music: 'Clipe' };
  var STATUS = {
    current: 'Em exibição',
    finished: 'Finalizado',
    upcoming: 'Em breve',
    unreleased: 'Não lançado',
    tba: 'A anunciar'
  };
  var SORTS = {
    popular: 'popularityRank',
    rating: '-averageRating',
    recent: '-startDate'
  };

  function encodeParams(params) {
    return Object.keys(params)
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  /**
   * URL de listagem/busca. Sem filtro algum, devolve os mais populares.
   * `season`/`seasonYear` restringem à temporada (usado na tela inicial).
   * Na busca por texto a API já ordena por relevância, então `sort` é omitido.
   */
  function buildListUrl(options) {
    var o = options || {};
    var query = (o.query || '').trim();
    var params = {
      'page[limit]': o.limit || PAGE_SIZE,
      'page[offset]': o.offset || 0,
      'filter[text]': query,
      'filter[categories]': o.category,
      'filter[subtype]': o.subtype,
      'filter[season]': o.season,
      'filter[seasonYear]': o.seasonYear,
      sort: query ? '' : (SORTS[o.sort] || SORTS.popular)
    };
    return API_BASE + '/anime?' + encodeParams(params);
  }

  var SEASONS = [
    { id: 'winter', label: 'Inverno' },
    { id: 'spring', label: 'Primavera' },
    { id: 'summer', label: 'Verão' },
    { id: 'fall', label: 'Outono' }
  ];

  /** Temporada de anime (padrão japonês) de uma data: jan-mar inverno, abr-jun primavera... */
  function currentSeason(date) {
    var d = date || new Date();
    var season = SEASONS[Math.floor(d.getMonth() / 3)];
    return { season: season.id, year: d.getFullYear(), label: season.label + ' ' + d.getFullYear() };
  }

  function buildDetailsUrl(id) {
    return API_BASE + '/anime/' + encodeURIComponent(id) + '?' +
      encodeParams({ include: 'categories', 'fields[categories]': 'title' });
  }

  /** Nota da Kitsu vem de 0 a 100 como string ("84.07"); exibimos de 0 a 10. */
  function toRating(value) {
    var n = parseFloat(value);
    return isFinite(n) ? Math.round(n) / 10 : null;
  }

  function yearOf(date) {
    var match = /^(\d{4})/.exec(date || '');
    return match ? Number(match[1]) : null;
  }

  function pickImage(image, sizes) {
    if (!image) return '';
    for (var i = 0; i < sizes.length; i++) {
      if (image[sizes[i]]) return image[sizes[i]];
    }
    return '';
  }

  /** Converte um recurso "anime" da API no formato usado pela interface. */
  function normalizeAnime(item, included) {
    var a = (item && item.attributes) || {};
    var titles = a.titles || {};
    var title = a.canonicalTitle || titles.en || titles.en_jp || 'Sem título';
    var altTitle = titles.en && titles.en !== title ? titles.en : (titles.ja_jp || '');

    var categoryIds = (((item.relationships || {}).categories || {}).data || []).map(function (c) { return c.id; });
    var genres = (included || [])
      .filter(function (inc) { return inc.type === 'categories' && categoryIds.indexOf(inc.id) !== -1; })
      .map(function (inc) { return inc.attributes.title; });

    return {
      id: String(item.id),
      title: title,
      altTitle: altTitle,
      synopsis: (a.synopsis || '').replace(/\s*\(Source:[^)]*\)\s*$/i, '').trim(),
      poster: pickImage(a.posterImage, ['medium', 'small', 'large', 'original']),
      posterLarge: pickImage(a.posterImage, ['large', 'original', 'medium']),
      cover: pickImage(a.coverImage, ['large', 'original', 'small']),
      rating: toRating(a.averageRating),
      year: yearOf(a.startDate),
      type: SUBTYPES[a.subtype] || a.subtype || '',
      status: STATUS[a.status] || '',
      episodes: typeof a.episodeCount === 'number' ? a.episodeCount : null,
      episodeLength: typeof a.episodeLength === 'number' ? a.episodeLength : null,
      ageRating: a.ageRating || '',
      popularityRank: a.popularityRank || null,
      trailer: a.youtubeVideoId ? 'https://www.youtube.com/watch?v=' + a.youtubeVideoId : '',
      genres: genres
    };
  }

  /** Lê a resposta JSON:API e devolve itens normalizados + total + se há mais páginas. */
  function parseListResponse(json) {
    var data = (json && json.data) || [];
    return {
      items: data.map(function (item) { return normalizeAnime(item, json.included); }),
      total: (json && json.meta && json.meta.count) || data.length,
      hasMore: !!(json && json.links && json.links.next)
    };
  }

  function truncate(text, max) {
    if (!text || text.length <= max) return text || '';
    var cut = text.slice(0, max);
    var lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, '') + '…';
  }

  function debounce(fn, wait) {
    var timer = null;
    function debounced() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
    }
    debounced.cancel = function () { clearTimeout(timer); };
    return debounced;
  }

  function categoryLabel(slug) {
    var found = CATEGORIES.filter(function (c) { return c.slug === slug; })[0];
    return found ? found.label : '';
  }

  return {
    API_BASE: API_BASE,
    PAGE_SIZE: PAGE_SIZE,
    CATEGORIES: CATEGORIES,
    SUBTYPES: SUBTYPES,
    buildListUrl: buildListUrl,
    currentSeason: currentSeason,
    buildDetailsUrl: buildDetailsUrl,
    toRating: toRating,
    yearOf: yearOf,
    normalizeAnime: normalizeAnime,
    parseListResponse: parseListResponse,
    truncate: truncate,
    debounce: debounce,
    categoryLabel: categoryLabel
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CatalogLogic;
}

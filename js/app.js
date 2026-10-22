/**
 * Interface do catálogo: busca com debounce, filtros, grid de cards e modal.
 */
(function () {
  'use strict';

  var L = CatalogLogic;
  var SEARCH_DELAY = 450;
  var season = L.currentSeason(new Date());

  var state = {
    query: '',
    category: '',
    subtype: '',
    sort: 'popular',
    offset: 0,
    items: [],
    hasMore: false
  };
  var listController = null;
  var detailsController = null;
  var lastFocused = null;

  var els = {
    form: document.getElementById('search-form'),
    search: document.getElementById('search'),
    clear: document.getElementById('clear-search'),
    categories: document.getElementById('categories'),
    subtype: document.getElementById('subtype'),
    sort: document.getElementById('sort'),
    sortField: document.getElementById('sort-field'),
    title: document.getElementById('results-title'),
    meta: document.getElementById('results-meta'),
    grid: document.getElementById('grid'),
    status: document.getElementById('status'),
    more: document.getElementById('load-more'),
    modal: document.getElementById('modal'),
    modalBody: document.getElementById('modal-body'),
    menuToggle: document.getElementById('menu-toggle'),
    sidebar: document.getElementById('sidebar')
  };

  /* ---------- Requisições ---------- */

  function fetchJson(url, signal) {
    return fetch(url, { signal: signal }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function isFiltered() {
    return !!(state.query || state.category || state.subtype || state.sort !== 'popular');
  }

  /** Busca a primeira página (append=false) ou a próxima (append=true). */
  function loadList(append) {
    if (listController) listController.abort();
    listController = new AbortController();

    state.offset = append ? state.items.length : 0;
    var url = isFiltered()
      ? L.buildListUrl({ query: state.query, category: state.category, subtype: state.subtype, sort: state.sort, offset: state.offset })
      : L.buildListUrl({ season: season.season, seasonYear: season.year, offset: state.offset });

    if (!append) {
      state.items = [];
      renderSkeletons();
    }
    renderHeading();
    els.more.disabled = true;
    els.more.textContent = 'Carregando…';

    return fetchJson(url, listController.signal)
      .then(function (json) {
        var page = L.parseListResponse(json);
        state.items = append ? state.items.concat(page.items) : page.items;
        state.hasMore = page.hasMore;
        renderGrid(page.items, append);
        renderHeading(page.total);
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        renderError();
      });
  }

  function loadDetails(id) {
    if (detailsController) detailsController.abort();
    detailsController = new AbortController();
    return fetchJson(L.buildDetailsUrl(id), detailsController.signal)
      .then(function (json) {
        renderModal(L.normalizeAnime(json.data, json.included));
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        els.modalBody.replaceChildren(statusBox('😕', 'Não foi possível carregar os detalhes.', 'Tente novamente em instantes.'));
      });
  }

  /* ---------- Renderização ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function statusBox(icon, title, text, action) {
    var box = el('div', 'status-box');
    box.append(el('div', 'status-box__icon', icon), el('p', 'status-box__title', title));
    if (text) box.appendChild(el('p', 'status-box__text', text));
    if (action) box.appendChild(action);
    return box;
  }

  function renderHeading(total) {
    var parts = [];
    if (state.category) parts.push(L.categoryLabel(state.category));
    if (state.subtype) parts.push(L.SUBTYPES[state.subtype]);

    if (state.query) {
      els.title.textContent = 'Resultados para "' + state.query + '"';
    } else if (isFiltered()) {
      els.title.textContent = parts.length ? parts.join(' · ') : 'Catálogo';
    } else {
      els.title.textContent = '🔥 Destaques da temporada';
    }
    if (state.query && parts.length) els.title.textContent += ' em ' + parts.join(' · ');

    els.meta.textContent = typeof total === 'number' && isFiltered()
      ? total.toLocaleString('pt-BR') + (total === 1 ? ' título encontrado' : ' títulos encontrados')
      : (isFiltered() ? '' : 'Os mais populares de ' + season.label);
    els.sortField.hidden = !!state.query;
  }

  function renderSkeletons() {
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < 10; i++) {
      var card = el('div', 'card card--skeleton');
      card.setAttribute('aria-hidden', 'true');
      card.append(el('div', 'card__poster'), el('div', 'card__line'), el('div', 'card__line card__line--short'));
      fragment.appendChild(card);
    }
    els.grid.replaceChildren(fragment);
    els.status.replaceChildren();
    els.grid.setAttribute('aria-busy', 'true');
  }

  function buildCard(anime) {
    var card = el('button', 'card');
    card.type = 'button';
    card.dataset.id = anime.id;
    card.setAttribute('aria-label', 'Ver detalhes de ' + anime.title);

    var poster = el('div', 'card__poster');
    if (anime.poster) {
      var img = el('img');
      img.src = anime.poster;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      poster.appendChild(img);
    } else {
      poster.appendChild(el('span', 'card__noimg', 'Sem imagem'));
    }
    if (anime.rating !== null) poster.appendChild(el('span', 'card__rating', '★ ' + anime.rating.toFixed(1)));
    if (anime.type) poster.appendChild(el('span', 'card__type', anime.type));

    var body = el('div', 'card__body');
    body.append(
      el('h3', 'card__title', anime.title),
      el('p', 'card__meta', [anime.year, anime.episodes ? anime.episodes + ' ep.' : null].filter(Boolean).join(' · ') || '—'),
      el('p', 'card__desc', L.truncate(anime.synopsis, 110) || 'Sinopse indisponível.')
    );

    card.append(poster, body);
    return card;
  }

  function renderGrid(newItems, append) {
    els.grid.setAttribute('aria-busy', 'false');
    var fragment = document.createDocumentFragment();
    newItems.forEach(function (a) { fragment.appendChild(buildCard(a)); });
    if (append) els.grid.appendChild(fragment);
    else els.grid.replaceChildren(fragment);

    els.status.replaceChildren();
    if (!state.items.length) {
      els.status.appendChild(statusBox('🔎', 'Nenhum anime encontrado', 'Tente outro nome ou remova alguns filtros.'));
    }
    els.more.hidden = !state.hasMore;
    els.more.disabled = false;
    els.more.textContent = 'Carregar mais';
  }

  function renderError() {
    els.grid.setAttribute('aria-busy', 'false');
    els.grid.replaceChildren();
    var retry = el('button', 'btn', 'Tentar novamente');
    retry.type = 'button';
    retry.addEventListener('click', function () { loadList(false); });
    els.status.replaceChildren(statusBox('⚠️', 'Erro ao buscar os animes', 'Verifique sua conexão ou tente novamente.', retry));
    els.more.hidden = true;
  }

  function infoItem(label, value) {
    var item = el('div', 'info');
    item.append(el('dt', 'info__label', label), el('dd', 'info__value', value));
    return item;
  }

  function renderModal(anime) {
    var wrap = document.createDocumentFragment();

    var hero = el('div', 'detail__hero');
    if (anime.cover) hero.style.backgroundImage = 'url("' + anime.cover.replace(/"/g, '%22') + '")';
    else hero.classList.add('detail__hero--empty');
    wrap.appendChild(hero);

    var content = el('div', 'detail');
    var poster = el('img', 'detail__poster');
    poster.src = anime.posterLarge || anime.poster;
    poster.alt = 'Pôster de ' + anime.title;

    var head = el('div', 'detail__head');
    var title = el('h2', 'detail__title', anime.title);
    title.id = 'modal-title';
    head.appendChild(title);
    if (anime.altTitle) head.appendChild(el('p', 'detail__alt', anime.altTitle));

    if (anime.genres.length) {
      var tags = el('ul', 'tags');
      anime.genres.slice(0, 8).forEach(function (g) { tags.appendChild(el('li', 'tag', g)); });
      head.appendChild(tags);
    }

    var info = el('dl', 'detail__info');
    info.append(
      infoItem('Nota', anime.rating !== null ? '★ ' + anime.rating.toFixed(1) + ' / 10' : '—'),
      infoItem('Lançamento', anime.year ? String(anime.year) : '—'),
      infoItem('Formato', anime.type || '—'),
      infoItem('Episódios', anime.episodes ? String(anime.episodes) + (anime.episodeLength ? ' × ' + anime.episodeLength + ' min' : '') : '—'),
      infoItem('Status', anime.status || '—'),
      infoItem('Classificação', anime.ageRating || '—')
    );

    var synopsisTitle = el('h3', 'detail__subtitle', 'Sinopse');
    var synopsis = el('p', 'detail__synopsis', anime.synopsis || 'Sinopse indisponível.');

    var side = el('div', 'detail__side');
    side.appendChild(poster);
    if (anime.trailer) {
      var trailer = el('a', 'btn btn--trailer', '▶ Ver trailer');
      trailer.href = anime.trailer;
      trailer.target = '_blank';
      trailer.rel = 'noopener noreferrer';
      side.appendChild(trailer);
    }

    var main = el('div', 'detail__main');
    main.append(head, info, synopsisTitle, synopsis);
    content.append(side, main);
    wrap.appendChild(content);

    els.modalBody.replaceChildren(wrap);
    els.modal.setAttribute('aria-labelledby', 'modal-title');
  }

  /* ---------- Modal ---------- */

  function openModal(id) {
    lastFocused = document.activeElement;
    els.modalBody.replaceChildren(el('div', 'spinner', ''));
    els.modal.hidden = false;
    document.body.classList.add('modal-open');
    // Força reflow para a transição de entrada funcionar.
    void els.modal.offsetWidth;
    els.modal.classList.add('is-open');
    els.modal.querySelector('.modal__close').focus();
    loadDetails(id);
  }

  function closeModal() {
    if (els.modal.hidden) return;
    if (detailsController) detailsController.abort();
    els.modal.classList.remove('is-open');
    els.modal.hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /* ---------- Filtros ---------- */

  function renderCategories() {
    var fragment = document.createDocumentFragment();
    [{ slug: '', label: 'Todos' }].concat(L.CATEGORIES).forEach(function (c) {
      var li = el('li');
      var btn = el('button', 'cat', c.label);
      btn.type = 'button';
      btn.dataset.category = c.slug;
      btn.setAttribute('aria-pressed', String(c.slug === state.category));
      li.appendChild(btn);
      fragment.appendChild(li);
    });
    els.categories.replaceChildren(fragment);
  }

  var debouncedSearch = L.debounce(function () { loadList(false); }, SEARCH_DELAY);

  els.search.addEventListener('input', function () {
    var value = els.search.value.trim();
    els.clear.hidden = !els.search.value;
    if (value === state.query) return;
    state.query = value;
    debouncedSearch();
  });

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    debouncedSearch.cancel();
    state.query = els.search.value.trim();
    loadList(false);
  });

  els.clear.addEventListener('click', function () {
    els.search.value = '';
    els.clear.hidden = true;
    state.query = '';
    debouncedSearch.cancel();
    loadList(false);
    els.search.focus();
  });

  els.categories.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-category]');
    if (!btn) return;
    state.category = btn.dataset.category;
    renderCategories();
    els.sidebar.classList.remove('is-open');
    els.menuToggle.setAttribute('aria-expanded', 'false');
    loadList(false);
  });

  els.subtype.addEventListener('change', function () {
    state.subtype = els.subtype.value;
    loadList(false);
  });

  els.sort.addEventListener('change', function () {
    state.sort = els.sort.value;
    loadList(false);
  });

  els.more.addEventListener('click', function () { loadList(true); });

  els.grid.addEventListener('click', function (event) {
    var card = event.target.closest('.card[data-id]');
    if (card) openModal(card.dataset.id);
  });

  els.modal.addEventListener('click', function (event) {
    if (event.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeModal();
    if (event.key === '/' && document.activeElement !== els.search && els.modal.hidden) {
      event.preventDefault();
      els.search.focus();
    }
  });

  els.menuToggle.addEventListener('click', function () {
    var open = els.sidebar.classList.toggle('is-open');
    els.menuToggle.setAttribute('aria-expanded', String(open));
  });

  renderCategories();
  loadList(false);
})();

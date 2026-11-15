// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, a per-protocol detail
// view with the model's own inputs, and the protocol's farm plan verbatim
// from board.json. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', growth: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, base: DATA.base_multiple };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row, base) {
    return Math.max(1, Math.round(row.tvl_usd * base * row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier * row.data_multiplier));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('growth')) state.growth = params.get('growth');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.growth !== 'all') params.set('growth', state.growth);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.watch) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d >= 0)) return false;
      if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (state.growth === 'unknown' && r.change_7d !== null) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    return list.slice().sort(function (a, b) {
      var av, bv, key = state.sort;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'ring', 'aria-hidden': 'true' }),
        el('div', null, el('b', { text: 'Token Radar' }), el('br'), el('span', { text: 'radar-2 · pre-token board' }))),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })));
  }

  function hero() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('h1', { text: 'Which protocol without a token would be worth the most?' }),
      el('p', null, 'Every protocol below ', el('b', { text: 'records no token' }), ' — never "has none", because the record is not proof. ',
        'Implied value is this entry\u2019s claim about what a token would be worth if the protocol\u2019s record stayed as it is. ',
        'It is not a prediction of whether or when a token is issued. The watchlist is the floor: ',
        el('b', { text: DATA.watchlist_size + ' protocols at $50M+ TVL' }),
        ', and the early radar adds ', el('b', { text: DATA.early_size + ' more below the floor' }), '.'),
      el('div', { class: 'stats' },
        el('div', { class: 'stat' }, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('span', { text: 'Watchlist covered' })),
        el('div', { class: 'stat' }, el('b', { class: 'teal', text: String(DATA.board_size) }), el('span', { text: 'Pre-token rows scored' })),
        el('div', { class: 'stat' }, el('b', { text: DATA.base_multiple.toFixed(3) + 'x' }), el('span', { text: 'Base multiple — median live mcap/TVL (n=' + DATA.calibration_n + ')' })),
        el('div', { class: 'stat' }, el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('span', { text: 'Top implied value — ' + (top ? top.name : '') }))),
      el('div', { class: 'spot' }, el('h2', { text: 'Top 5 by implied value' }),
        el('div', { class: 'spot-grid' }, DATA.rows.slice(0, 5).map(function (r) {
          return el('button', { class: 'card', type: 'button', onclick: function () { openDetail(r.slug); } },
            el('span', { class: 'rank', text: 'RANK ' + r.rank }),
            el('b', { text: r.name }),
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'sub', text: 'TVL ' + fmtUsd(r.tvl_usd) + ' · 7d ' + fmtPct(r.change_7d) }));
        }))));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, allLabel, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: allLabel }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); }));
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live comparables', onclick: function () { state.tab = 'live'; render(); } });
    var scope = el('button', { type: 'button', 'aria-pressed': state.scope === 'watchlist' ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.scope = state.scope === 'watchlist' ? 'all' : 'watchlist'; writeHash(); render(); } });
    var scopeAll = el('button', { type: 'button', 'aria-pressed': state.scope === 'all' ? 'true' : 'false', text: 'All pre-token', onclick: function () { state.scope = 'all'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', categories, state.category, 'All categories', function (v) { state.category = v; }),
      select('chain', 'Chain', chains, state.chain, 'All chains', function (v) { state.chain = v; }),
      select('growth', '7-day growth', ['up', 'down', 'unknown'], state.growth, 'Any growth', function (v) { state.growth = v; }),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('div', { class: 'tabs' }, scopeAll, scope)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' }));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or growth filter to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.growth = 'all'; state.scope = 'all'; writeHash(); render(); } })));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') + (r.watch ? '  ' : '') }),
          r.watch ? el('span', { class: 'watch', text: 'WATCHLIST' }) : null)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, el('span', { class: 'tag', text: 'no token' })));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' }))),
          tbody)));
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'tag live', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl_ratio === null ? 'n/a' : r.mcap_tvl_ratio.toFixed(2) + 'x' })));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Live-token protocols by market cap. Their mcap/TVL ratios calibrate the board\u2019s base multiple — the median, ' + DATA.base_multiple.toFixed(3) + 'x across ' + DATA.calibration_n + ' protocols, is what the pre-token board is priced on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }))),
          tbody)));
  }

  function modelPanel() {
    var m = DATA.model;
    var top = DATA.rows[0];
    var out = el('output', { text: 'at ' + state.base.toFixed(3) + 'x, ' + (top ? top.name : '') + ' would be ' + (top ? fmtUsd(impliedOf(top, state.base)) : 'n/a') });
    var slider = el('input', { type: 'range', min: '0.05', max: '0.50', step: '0.005', value: String(state.base), 'aria-label': 'Base multiple to explore' });
    slider.addEventListener('input', function () {
      state.base = parseFloat(slider.value);
      out.textContent = 'at ' + state.base.toFixed(3) + 'x, ' + (top ? top.name : '') + ' would be ' + (top ? fmtUsd(impliedOf(top, state.base)) : 'n/a');
    });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to calibrated ' + DATA.base_multiple.toFixed(3) + 'x', onclick: function () { state.base = DATA.base_multiple; slider.value = String(state.base); out.textContent = 'at ' + state.base.toFixed(3) + 'x, ' + (top ? top.name : '') + ' would be ' + (top ? fmtUsd(impliedOf(top, state.base)) : 'n/a'); } });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed — model ' + DATA.model_version }),
      el('p', { class: 'sub', text: 'One function scores every row. No protocol name is special-cased, and no row is hand-picked. The base multiple is not asserted: it is the median mcap/TVL of the live-token protocols in this same snapshot.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd × base × growth × maturity × breadth × data )\n' +
        'base     = median live mcap/TVL = ' + DATA.base_multiple.toFixed(3) + ' (n=' + DATA.calibration_n + ', clamped 0.05–0.50)\n' +
        'growth   = 1 + ' + m.growth_weight + ' × tanh(clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / ' + m.growth_scale + ')   — saturates, so one wild week cannot win\n' +
        'maturity = ' + m.maturity_floor + ' + ' + m.maturity_range + ' × ln(1 + min(age_days, ' + m.maturity_days + ')) / ln(' + (m.maturity_days + 1) + ')   — log age; unknown age counts as ' + m.unknown_age_days + ' days\n' +
        'breadth  = 1 + ' + m.breadth_per_chain + ' × min(chains − 1, ' + m.breadth_max_extra + ')   — multi-chain TVL is harder to lose\n' +
        'data     = ' + m.missing_growth_haircut + ' when change_7d is unreported, else 1.00'),
      el('div', { class: 'slider-row' },
        el('span', { class: 'sub', text: 'Explore the base multiple:' }), slider, out, reset),
      el('p', { class: 'sub', text: 'The slider only explores — the board\u2019s ranks and values stay at the calibrated ' + DATA.base_multiple.toFixed(3) + 'x. A protocol below the $50M floor is no worse a subject than one on the watchlist: the floor is where the reading starts, not where it stops.' }));
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.base_multiple);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watch ? ' · on the watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Base multiple (median live mcap/TVL)' }), el('b', { class: 'num', text: row.base_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth ' + fmtPct(row.change_7d) }), el('b', { class: 'num', text: '× ' + row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token: ' + fmtAge(row.age_days) }), el('b', { class: 'num', text: '× ' + row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chains: ' + (row.chains || []).length }), el('b', { class: 'num', text: '× ' + row.breadth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Data completeness' }), el('b', { class: 'num', text: '× ' + row.data_multiplier.toFixed(2) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (Math.abs(recomputed - row.implied_value_usd) <= Math.max(1, row.implied_value_usd * 0.001) ? ', the same number board.json carries (to the rounding of the four multipliers).' : ', which differs from the board: the data would be stale.') + ' This is an estimate of what a token would be worth if the record stayed as it is — not a price, and not a promise that a token comes.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 7 steps' }),
      el('ol', { class: 'steps' }, (row.farm_steps || []).map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('p', { class: 'note', text: 'Costs are gas plus the capital that stays in the position. Never pay to claim a reward, and never trust a link that is not the protocol\u2019s own.' })));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(hero());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

/**
 * Heureka Conversions Report - frontend
 * Načítá data přes backend proxy, zobrazuje souhrn a tabulku s filtry,
 * řazením, stránkováním (100/stránka) a exportem CSV.
 */

(function () {
  var dateFrom = document.getElementById('date-from');
  var dateTo = document.getElementById('date-to');
  var btnLoad = document.getElementById('btn-load');
  var statusEl = document.getElementById('status');
  var summarySection = document.getElementById('summary');
  var summaryGrid = document.getElementById('summary-grid');
  var summaryDerived = document.getElementById('summary-derived');
  var tableSection = document.getElementById('table-section');
  var tableHead = document.getElementById('table-head');
  var tableBody = document.getElementById('table-body');
  var searchInput = document.getElementById('search');
  var filterClickSource = document.getElementById('filter-click-source');
  var filterBidded = document.getElementById('filter-bidded');
  var btnExportCsv = document.getElementById('btn-export-csv');
  var paginationEl = document.getElementById('pagination');
  var loadingOverlay = document.getElementById('loading-overlay');

  var PAGE_SIZE = 100;
  var rawConversions = [];
  var sortCol = 'orders_total';
  var sortDesc = true;
  var currentPage = 1;
  var lastFilteredSorted = [];

  var DATE_FIRST = '2025-05-01';

  function getTodayDate() {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  function setTodayDefault() {
    var today = getTodayDate();
    if (dateFrom && dateTo) {
      dateFrom.min = DATE_FIRST;
      dateFrom.max = today;
      dateTo.min = DATE_FIRST;
      dateTo.max = today;
      dateFrom.value = today;
      dateTo.value = today;
    }
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (isError ? ' error' : '');
  }

  function num(v) {
    if (v == null || v === '') return 0;
    var n = Number(v);
    return isNaN(n) ? 0 : n;
  }

  function rowToFlat(row) {
    var visits = row.visits || {};
    var costsVat = row.costs_with_vat || {};
    var costsNoVat = row.costs_without_vat || {};
    var orders = row.orders || {};
    var revenue = row.revenue || {};
    var shop = row.shop_item || {};
    var portal = row.portal_category || {};
    return {
      date: row.date || '',
      click_source: row.click_source || '',
      on_bidded_position: row.on_bidded_position,
      satellite_name: row.satellite_name || '',
      product_card_id: row.product_card_id || '',
      shop_item_id: shop.id || '',
      shop_item_name: shop.name || '',
      portal_category_id: portal.id || '',
      visits_total: num(visits.total),
      visits_free: num(visits.free),
      visits_bidded: num(visits.bidded),
      visits_not_bidded: num(visits.not_bidded),
      costs_with_vat_total: num(costsVat.total),
      costs_with_vat_bidded: num(costsVat.bidded),
      costs_with_vat_not_bidded: num(costsVat.not_bidded),
      costs_without_vat_total: num(costsNoVat.total),
      costs_without_vat_bidded: num(costsNoVat.bidded),
      costs_without_vat_not_bidded: num(costsNoVat.not_bidded),
      orders_total: num(orders.total),
      orders_free: num(orders.free),
      orders_bidded: num(orders.bidded),
      orders_not_bidded: num(orders.not_bidded),
      revenue_total: num(revenue.total),
      revenue_free: num(revenue.free),
      revenue_bidded: num(revenue.bidded),
      revenue_not_bidded: num(revenue.not_bidded),
    };
  }

  function aggregate(flatRows) {
    var a = {
      visits: { total: 0, free: 0, bidded: 0, not_bidded: 0 },
      orders: { total: 0, free: 0, bidded: 0, not_bidded: 0 },
      revenue: { total: 0, free: 0, bidded: 0, not_bidded: 0 },
      costs_with_vat: { total: 0, bidded: 0, not_bidded: 0 },
      costs_without_vat: { total: 0, bidded: 0, not_bidded: 0 },
    };
    flatRows.forEach(function (r) {
      a.visits.total += r.visits_total;
      a.visits.free += r.visits_free;
      a.visits.bidded += r.visits_bidded;
      a.visits.not_bidded += r.visits_not_bidded;
      a.orders.total += r.orders_total;
      a.orders.free += r.orders_free;
      a.orders.bidded += r.orders_bidded;
      a.orders.not_bidded += r.orders_not_bidded;
      a.revenue.total += r.revenue_total;
      a.revenue.free += r.revenue_free;
      a.revenue.bidded += r.revenue_bidded;
      a.revenue.not_bidded += r.revenue_not_bidded;
      a.costs_with_vat.total += r.costs_with_vat_total;
      a.costs_with_vat.bidded += r.costs_with_vat_bidded;
      a.costs_with_vat.not_bidded += r.costs_with_vat_not_bidded;
      a.costs_without_vat.total += r.costs_without_vat_total;
      a.costs_without_vat.bidded += r.costs_without_vat_bidded;
      a.costs_without_vat.not_bidded += r.costs_without_vat_not_bidded;
    });
    return a;
  }

  /** Seskupí řádky podle produktu a sečte metriky – jeden řádek = jeden produkt za celé období. */
  function aggregateByProduct(flatRows) {
    var map = {};
    flatRows.forEach(function (r, i) {
      var key = (r.product_card_id && String(r.product_card_id).trim()) || (r.shop_item_id && ('sid_' + r.shop_item_id)) || (r.shop_item_name && ('n_' + r.shop_item_name)) || ('idx_' + i);
      if (!map[key]) {
        map[key] = {
          date: '',
          click_source: '',
          on_bidded_position: null,
          satellite_name: r.satellite_name || '',
          product_card_id: r.product_card_id || '',
          shop_item_id: r.shop_item_id || '',
          shop_item_name: r.shop_item_name || '',
          portal_category_id: r.portal_category_id || '',
          visits_total: 0,
          visits_free: 0,
          visits_bidded: 0,
          visits_not_bidded: 0,
          costs_with_vat_total: 0,
          costs_with_vat_bidded: 0,
          costs_with_vat_not_bidded: 0,
          costs_without_vat_total: 0,
          costs_without_vat_bidded: 0,
          costs_without_vat_not_bidded: 0,
          orders_total: 0,
          orders_free: 0,
          orders_bidded: 0,
          orders_not_bidded: 0,
          revenue_total: 0,
          revenue_free: 0,
          revenue_bidded: 0,
          revenue_not_bidded: 0,
        };
      }
      var o = map[key];
      o.visits_total += r.visits_total;
      o.visits_free += r.visits_free;
      o.visits_bidded += r.visits_bidded;
      o.visits_not_bidded += r.visits_not_bidded;
      o.costs_with_vat_total += r.costs_with_vat_total;
      o.costs_with_vat_bidded += r.costs_with_vat_bidded;
      o.costs_with_vat_not_bidded += r.costs_with_vat_not_bidded;
      o.costs_without_vat_total += r.costs_without_vat_total;
      o.costs_without_vat_bidded += r.costs_without_vat_bidded;
      o.costs_without_vat_not_bidded += r.costs_without_vat_not_bidded;
      o.orders_total += r.orders_total;
      o.orders_free += r.orders_free;
      o.orders_bidded += r.orders_bidded;
      o.orders_not_bidded += r.orders_not_bidded;
      o.revenue_total += r.revenue_total;
      o.revenue_free += r.revenue_free;
      o.revenue_bidded += r.revenue_bidded;
      o.revenue_not_bidded += r.revenue_not_bidded;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function fmtNum(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
  }

  function renderSummary(agg) {
    summaryGrid.innerHTML =
      '<div class="summary-block"><h3>Prokliky (Visits)</h3><p>celkem: ' + fmtNum(agg.visits.total) + '</p><p>free: ' + fmtNum(agg.visits.free) + '</p><p>bidded: ' + fmtNum(agg.visits.bidded) + '</p><p>not_bidded: ' + fmtNum(agg.visits.not_bidded) + '</p></div>' +
      '<div class="summary-block"><h3>Konverze (Orders)</h3><p>celkem: ' + fmtNum(agg.orders.total) + '</p><p>free: ' + fmtNum(agg.orders.free) + '</p><p>bidded: ' + fmtNum(agg.orders.bidded) + '</p><p>not_bidded: ' + fmtNum(agg.orders.not_bidded) + '</p></div>' +
      '<div class="summary-block"><h3>Tržby (Revenue)</h3><p>celkem: ' + fmtNum(agg.revenue.total) + '</p><p>free: ' + fmtNum(agg.revenue.free) + '</p><p>bidded: ' + fmtNum(agg.revenue.bidded) + '</p><p>not_bidded: ' + fmtNum(agg.revenue.not_bidded) + '</p></div>' +
      '<div class="summary-block"><h3>Náklady s DPH</h3><p>celkem: ' + fmtNum(agg.costs_with_vat.total) + '</p><p>bidded: ' + fmtNum(agg.costs_with_vat.bidded) + '</p><p>not_bidded: ' + fmtNum(agg.costs_with_vat.not_bidded) + '</p></div>' +
      '<div class="summary-block"><h3>Náklady bez DPH</h3><p>celkem: ' + fmtNum(agg.costs_without_vat.total) + '</p><p>bidded: ' + fmtNum(agg.costs_without_vat.bidded) + '</p><p>not_bidded: ' + fmtNum(agg.costs_without_vat.not_bidded) + '</p></div>';
    var derived = '';
    if (agg.costs_with_vat.total > 0) {
      var roas = agg.revenue.total / agg.costs_with_vat.total;
      derived += '<span class="kpi-box"><span class="kpi-label">ROAS</span><span class="kpi-value">' + roas.toFixed(2) + '</span></span>';
    }
    if (agg.revenue.total > 0) {
      var pno = (agg.costs_with_vat.total / agg.revenue.total) * 100;
      derived += '<span class="kpi-box"><span class="kpi-label">PNO</span><span class="kpi-value">' + pno.toFixed(2) + ' %</span></span>';
    }
    summaryDerived.innerHTML = derived || '<p>—</p>';
  }

  function getFilteredRows() {
    var search = (searchInput.value || '').trim().toLowerCase();
    var clickSrc = (filterClickSource.value || '').trim();
    var bidded = (filterBidded.value || '').trim();
    return rawConversions.filter(function (r) {
      if (search) {
        var name = (r.shop_item_name || '').toLowerCase();
        var id = String(r.shop_item_id || '').toLowerCase();
        if (name.indexOf(search) === -1 && id.indexOf(search) === -1) return false;
      }
      if (clickSrc && r.click_source !== clickSrc) return false;
      if (bidded === 'true' && !r.on_bidded_position) return false;
      if (bidded === 'false' && r.on_bidded_position) return false;
      return true;
    });
  }

  function getSortedRows(rows) {
    var arr = rows.slice();
    arr.sort(function (a, b) {
      var va = a[sortCol];
      var vb = b[sortCol];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDesc ? vb - va : va - vb;
      }
      va = String(va);
      vb = String(vb);
      if (sortDesc) return vb.localeCompare(va, 'cs');
      return va.localeCompare(vb, 'cs');
    });
    return arr;
  }

  function fillClickSourceOptions(flatRows) {
    var set = new Set();
    flatRows.forEach(function (r) {
      if (r.click_source != null && r.click_source !== '') set.add(r.click_source);
    });
    var opts = Array.from(set).sort();
    filterClickSource.innerHTML = '<option value="">Vše</option>' + opts.map(function (o) {
      return '<option value="' + escapeHtml(o) + '">' + escapeHtml(o) + '</option>';
    }).join('');
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatCell(val) {
    if (val == null) return '';
    if (typeof val === 'boolean') return val ? 'Ano' : 'Ne';
    if (typeof val === 'number') return fmtNum(val);
    return String(val);
  }

  function updateSortIndicators() {
    var ths = tableHead.querySelectorAll('th[data-col]');
    ths.forEach(function (th) {
      var col = th.getAttribute('data-col');
      var label = th.getAttribute('data-label') || col;
      if (col === sortCol) {
        th.innerHTML = escapeHtml(label) + ' <span class="sort-arrow">' + (sortDesc ? '\u25BC' : '\u25B2') + '</span>';
      } else {
        th.textContent = label;
      }
    });
  }

  function renderTable() {
    var filtered = getFilteredRows();
    var aggregated = aggregateByProduct(filtered);
    var sorted = getSortedRows(aggregated);
    lastFilteredSorted = sorted;

    var totalRows = sorted.length;
    var totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var startIdx = (currentPage - 1) * PAGE_SIZE;
    var endIdx = Math.min(startIdx + PAGE_SIZE, totalRows);
    var pageRows = sorted.slice(startIdx, endIdx);

    updateSortIndicators();

    tableBody.innerHTML = pageRows.map(function (r) {
      return '<tr>' +
        '<td class="name">' + escapeHtml(formatCell(r.shop_item_name)) + '</td>' +
        '<td class="num">' + formatCell(r.visits_total) + '</td>' +
        '<td class="num">' + formatCell(r.costs_with_vat_total) + '</td>' +
        '<td class="num">' + formatCell(r.orders_total) + '</td>' +
        '<td class="num">' + formatCell(r.revenue_total) + '</td>' +
        '<td class="num">' + escapeHtml(formatCell(r.shop_item_id)) + '</td>' +
        '</tr>';
    }).join('');

    renderPagination(totalRows, totalPages);
  }

  function renderPagination(totalRows, totalPages) {
    if (!paginationEl) return;
    if (totalRows <= PAGE_SIZE) {
      paginationEl.innerHTML = '<span class="page-info">Zobrazeno ' + totalRows + ' z ' + totalRows + ' záznamů</span>';
      return;
    }
    var startIdx = (currentPage - 1) * PAGE_SIZE + 1;
    var endIdx = Math.min(currentPage * PAGE_SIZE, totalRows);
    var html = '<span class="page-info">Zobrazeno ' + startIdx + '–' + endIdx + ' z ' + totalRows + ' záznamů</span>';
    html += '<div class="page-buttons">';
    if (currentPage > 1) {
      html += '<button type="button" class="page-btn" data-page="1">&laquo; První</button>';
      html += '<button type="button" class="page-btn" data-page="' + (currentPage - 1) + '">&lsaquo; Předchozí</button>';
    }
    var rangeStart = Math.max(1, currentPage - 2);
    var rangeEnd = Math.min(totalPages, currentPage + 2);
    for (var i = rangeStart; i <= rangeEnd; i++) {
      if (i === currentPage) {
        html += '<button type="button" class="page-btn active" data-page="' + i + '">' + i + '</button>';
      } else {
        html += '<button type="button" class="page-btn" data-page="' + i + '">' + i + '</button>';
      }
    }
    if (currentPage < totalPages) {
      html += '<button type="button" class="page-btn" data-page="' + (currentPage + 1) + '">Další &rsaquo;</button>';
      html += '<button type="button" class="page-btn" data-page="' + totalPages + '">Poslední &raquo;</button>';
    }
    html += '</div>';
    paginationEl.innerHTML = html;
    paginationEl.querySelectorAll('.page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentPage = parseInt(btn.getAttribute('data-page'), 10);
        renderTable();
        var tableTop = tableSection.getBoundingClientRect().top + window.scrollY - 10;
        window.scrollTo({ top: tableTop, behavior: 'smooth' });
      });
    });
  }

  function initSort() {
    var headers = tableHead.querySelectorAll('th[data-col]');
    headers.forEach(function (th) {
      th.addEventListener('click', function () {
        var col = th.getAttribute('data-col');
        if (sortCol === col) {
          sortDesc = !sortDesc;
        } else {
          sortCol = col;
          sortDesc = true;
        }
        currentPage = 1;
        renderTable();
      });
    });
  }

  function getTodayStr() {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  function loadReport() {
    var from = (dateFrom && dateFrom.value) ? dateFrom.value.trim() : '';
    var to = (dateTo && dateTo.value) ? dateTo.value.trim() : '';
    var fromVal = from || getTodayStr();
    var toVal = to || getTodayStr();
    if (fromVal > toVal) {
      setStatus('Datum Od musí být před nebo rovno Datum Do.', true);
      return;
    }
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    setStatus('');
    var url = '/api/conversions?date_from=' + encodeURIComponent(fromVal) + '&date_to=' + encodeURIComponent(toVal);
    fetch(url)
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) {
            throw new Error(body.error || 'Chyba ' + res.status);
          }
          return body;
        });
      })
      .then(function (data) {
        var list = data.conversions || [];
        rawConversions = list.map(rowToFlat);
        var agg = aggregate(rawConversions);
        summarySection.classList.remove('hidden');
        tableSection.classList.remove('hidden');
        renderSummary(agg);
        fillClickSourceOptions(rawConversions);
        sortCol = 'orders_total';
        sortDesc = true;
        currentPage = 1;
        renderTable();
        var productCount = aggregateByProduct(rawConversions).length;
        setStatus('Načteno ' + list.length + ' záznamů, zobrazeno ' + productCount + ' produktů za celé období.');
      })
      .catch(function (err) {
        setStatus(err.message || 'Chyba při načítání.', true);
      })
      .finally(function () {
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
      });
  }

  function exportCsv() {
    var rows = lastFilteredSorted.length ? lastFilteredSorted : getSortedRows(aggregateByProduct(getFilteredRows()));
    var cols = ['shop_item_name', 'visits_total', 'costs_with_vat_total', 'orders_total', 'revenue_total', 'shop_item_id'];
    var header = cols.join(',');
    var csvRows = rows.map(function (r) {
      return cols.map(function (c) {
        var v = r[c];
        var s = v == null ? '' : String(v);
        if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    });
    var csv = [header].concat(csvRows).join('\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    var from = dateFrom.value || '';
    var to = dateTo.value || '';
    a.href = URL.createObjectURL(blob);
    a.download = 'heureka-conversions-' + (from === to ? from : from + '_' + to) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onFilterChange() {
    currentPage = 1;
    renderTable();
  }

  btnLoad.addEventListener('click', loadReport);
  searchInput.addEventListener('input', onFilterChange);
  searchInput.addEventListener('change', onFilterChange);
  filterClickSource.addEventListener('change', onFilterChange);
  filterBidded.addEventListener('change', onFilterChange);
  btnExportCsv.addEventListener('click', exportCsv);

  setTodayDefault();
  initSort();
})();

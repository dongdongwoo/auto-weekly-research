export const DASH_JS = `(function () {
  function norm(s) {
    return String(s || '')
      .toLocaleLowerCase()
      .normalize('NFC')
      .replace(/[^\\p{L}\\p{N}\\s]+/gu, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function visible(el) {
    if (
      el.classList.contains('is-hidden') ||
      el.classList.contains('axis-hidden')
    ) {
      return false;
    }
    return el.getClientRects().length > 0;
  }

  function applySearch() {
    var t = document.querySelector('[data-q]');
    if (!t) return;
    var q = norm(t.value);
    var terms = q.split(' ').filter(Boolean);
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('is-searching', terms.length > 0);

    document.querySelectorAll('[data-s]').forEach(function (el) {
      var hay = norm(el.getAttribute('data-s'));
      var compact = hay.replace(/\\s/g, '');
      var ok =
        !terms.length ||
        terms.every(function (term) {
          return hay.indexOf(term) !== -1 || compact.indexOf(term.replace(/\\s/g, '')) !== -1;
        });
      el.classList.toggle('is-hidden', !ok);
    });
    syncChecked();
  }

  function applySort() {
    var sel = document.querySelector('[data-sort]');
    var old = sel && sel.value === 'old';
    document.querySelectorAll('[data-sort-list]').forEach(function (list) {
      list.classList.toggle('is-old', !!old);
    });
    syncChecked();
  }

  function applyAxis() {
    var checked = document.querySelector('[data-axis-filter]:checked');
    var ax = checked ? checked.value : 'all';
    document.querySelectorAll('.panel-articles [data-ax]').forEach(function (el) {
      el.classList.toggle('axis-hidden', ax !== 'all' && el.getAttribute('data-ax') !== ax);
    });
    syncChecked();
  }

  function dateHasRows(date) {
    return [].some.call(document.querySelectorAll('.row[data-date="' + date + '"]'), function (el) {
      return !el.classList.contains('is-hidden');
    });
  }

  function nearestDate(value, dates) {
    if (dates.indexOf(value) !== -1) return value;
    var t = Date.parse(value);
    var best = dates[0];
    var bestD = Math.abs(Date.parse(best) - t);
    dates.forEach(function (d) {
      var n = Math.abs(Date.parse(d) - t);
      if (n < bestD) {
        best = d;
        bestD = n;
      }
    });
    return best;
  }

  function applyDay(fromPicker) {
    var pick = document.querySelector('[data-day]');
    if (!pick) return;
    var dates = (pick.getAttribute('data-dates') || '').split(',').filter(Boolean);
    if (!dates.length) return;
    var value = fromPicker && pick.value ? pick.value : '';
    if (!value) {
      var checked = document.querySelector('input[name="daily-date"]:checked');
      value = checked ? checked.id.replace(/^dd-/, '') : dates[0];
    }
    if (dates.indexOf(value) === -1 || !dateHasRows(value)) {
      var usable = dates.filter(dateHasRows);
      value = nearestDate(value, usable.length ? usable : dates);
    }
    pick.value = value;
    var radio = document.getElementById('dd-' + value);
    if (radio) radio.checked = true;
    syncChecked();
  }

  function syncChecked() {
    document.querySelectorAll('.list').forEach(function (list) {
      if (list.getClientRects().length === 0) return;
      var rows = [].slice.call(list.querySelectorAll('label.row'));
      var shown = rows.filter(visible);
      var checkedRow = rows.find(function (r) {
        var inp = r.querySelector('input[type="radio"]');
        return inp && inp.checked;
      });
      var checkedVisible = checkedRow && shown.indexOf(checkedRow) !== -1;
      if (!checkedVisible && shown[0]) {
        var inp = shown[0].querySelector('input[type="radio"]');
        if (inp) inp.checked = true;
      }
    });
  }

  function selectLatestWeekly() {
    var list = document.querySelector('.panel-weekly .list');
    if (!list) return;
    var rows = [].slice.call(list.querySelectorAll('label.row'));
    var shown = rows.filter(visible);
    if (!shown[0]) return;
    var inp = shown[0].querySelector('input[type="radio"]');
    if (inp) inp.checked = true;
    scrollDetailToTop('.panel-weekly');
  }

  function clearSearchIfNeeded() {
    var q = document.querySelector('[data-q]');
    if (q && q.value) {
      q.value = '';
      applySearch();
    }
  }

  /** /dashboard.version.json 과 페이지 embedded 시각 비교 — 바뀐 경우만 reload */
  function watchSnapshotVersion() {
    var shell = document.querySelector('.shell[data-generated-at]');
    if (!shell) return;
    var pageAt = Date.parse(shell.getAttribute('data-generated-at') || '');
    if (!pageAt || Number.isNaN(pageAt)) return;

    var pollSec = Number(shell.getAttribute('data-poll-sec') || 300);
    if (!pollSec || pollSec < 60) pollSec = 60;
    var checking = false;

    function check() {
      if (checking || document.hidden) return;
      checking = true;
      fetch('/dashboard.version.json', { cache: 'no-store' })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (ver) {
          if (!ver || !ver.generatedAt) return;
          var remoteAt = Date.parse(ver.generatedAt);
          if (!Number.isNaN(remoteAt) && remoteAt > pageAt + 1000) {
            location.reload();
          }
        })
        .catch(function () {})
        .finally(function () {
          checking = false;
        });
    }

    setInterval(check, pollSec * 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) check();
    });
  }

  function trackAnalytics(name, data) {
    try {
      if (window.__trackAnalytics) window.__trackAnalytics(name, data || undefined);
    } catch (e) {}
  }

  function trackMainTab() {
    var view = document.querySelector('input[name="view"]:checked');
    if (!view || !view.id) return;
    var tab = view.id.replace(/^view-/, '');
    if (tab) trackAnalytics('tab-' + tab);
  }

  function trackDailyTab() {
    var day = document.querySelector('input[name="daily-date"]:checked');
    if (!day || !day.id) return;
    trackAnalytics('daily-date', { date: day.id.replace(/^dd-/, '') });
  }

  function openTrendModal(id) {
    var dlg = document.getElementById('trend-modal-' + id);
    if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  }

  function isMobileDetail() {
    return window.matchMedia('(max-width: 800px)').matches;
  }

  function shellEl() {
    return document.querySelector('.shell');
  }

  function openMobileDetail() {
    if (!isMobileDetail()) return;
    var shell = shellEl();
    if (shell) shell.classList.add('mobile-detail-open');
  }

  function closeMobileDetail() {
    var shell = shellEl();
    if (shell) shell.classList.remove('mobile-detail-open');
  }

  function scrollDetailToTop(panelSelector) {
    var detail = document.querySelector(panelSelector + ' .detail');
    if (detail) detail.scrollTop = 0;
  }

  function bindMobileDetail() {
    document.addEventListener('click', function (e) {
      var row =
        e.target.closest &&
        e.target.closest('.panel-articles label.row, .panel-weekly label.row');
      if (row && isMobileDetail()) {
        if (row.closest('.panel-weekly')) {
          requestAnimationFrame(function () {
            scrollDetailToTop('.panel-weekly');
          });
        }
        openMobileDetail();
      }
    });

    document.querySelectorAll('[data-detail-back]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        closeMobileDetail();
      });
    });

    window.addEventListener('resize', function () {
      if (!isMobileDetail()) closeMobileDetail();
    });
  }

  function bindTrendModals() {
    document.querySelectorAll('.trend-dialog').forEach(function (dlg) {
      dlg.addEventListener('click', function (e) {
        if (e.target === dlg) dlg.close();
      });
    });
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-trend-close]')) {
        var dlg = e.target.closest('.trend-dialog');
        if (dlg) dlg.close();
        return;
      }
      var card = e.target.closest && e.target.closest('.trend-card-click[data-trend-id]');
      if (!card || e.target.closest('a')) return;
      openTrendModal(card.getAttribute('data-trend-id'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest && e.target.closest('.trend-card-click[data-trend-id]');
      if (!card) return;
      e.preventDefault();
      openTrendModal(card.getAttribute('data-trend-id'));
    });
  }

  function initSearchFromUrl() {
    var params = new URLSearchParams(location.search);
    var q = params.get('q');
    if (!q) return;
    var input = document.querySelector('[data-q]');
    if (!input) return;
    input.value = q;
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.add('is-searching');
  }

  function boot() {
    initSearchFromUrl();
    applyDay(false);
    applySearch();
    applySort();
    applyAxis();
    watchSnapshotVersion();
    bindMobileDetail();
    bindTrendModals();
    trackMainTab();
  }

  document.addEventListener('input', function (e) {
    if (e.target && e.target.getAttribute && e.target.getAttribute('data-q') != null) {
      applySearch();
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.getAttribute && t.getAttribute('data-sort') != null) applySort();
    if (t.getAttribute && t.getAttribute('data-axis-filter') != null) applyAxis();
    if (t.getAttribute && t.getAttribute('data-day') != null) applyDay(true);
    if (t.name === 'view') {
      closeMobileDetail();
      trackMainTab();
    }
    if (t.name === 'daily-date') trackDailyTab();
    if (t.name === 'weekly-art') {
      trackAnalytics('weekly-report', { week: t.id ? t.id.replace(/^w-art-/, '') : '' });
      requestAnimationFrame(function () {
        scrollDetailToTop('.panel-weekly');
      });
    }
    if (t.name === 'view' || t.name === 'daily-date') {
      requestAnimationFrame(function () {
        applyDay(false);
        syncChecked();
      });
    }
  });

  document.addEventListener('click', function (e) {
    var lab =
      e.target &&
      e.target.closest &&
      e.target.closest('.nav label, label.logo, .overview-link, .overview-nav-btn');
    if (!lab) return;
    clearSearchIfNeeded();
    closeMobileDetail();
    if (lab.classList.contains('go-weekly-latest')) {
      requestAnimationFrame(function () {
        selectLatestWeekly();
        syncChecked();
      });
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(syncChecked);
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.__dashReady = true;
})();`;

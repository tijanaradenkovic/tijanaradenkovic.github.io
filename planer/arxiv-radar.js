(function () {
  'use strict';

  var categories = ['gr-qc', 'hep-th', 'math-ph', 'math.QA', 'quant-ph'];
  var feedUrl = 'https://raw.githubusercontent.com/tijanaradenkovic/tijanaradenkovic.github.io/planner-arxiv-data/feed.json';
  var preferenceKey, feed, loading = false, failed = false, limit = 25, context, root, form;
  var idPattern = /^(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})$/;

  function state() {
    var stored = context.state().radar || {};
    return {
      categories: Array.isArray(stored.categories) ? categories.filter(function (category) {
        return stored.categories.includes(category);
      }) : categories.slice(0, 3),
      keywords: typeof stored.keywords === 'string' ? stored.keywords : '',
      authors: typeof stored.authors === 'string' ? stored.authors : '',
      matches: stored.matches === true,
      saved: Array.isArray(stored.saved) ? stored.saved.filter(function (paper) {
        return paper && idPattern.test(paper.id);
      }) : []
    };
  }

  function terms(value) {
    return value.toLowerCase().split(',').map(function (term) { return term.trim(); }).filter(Boolean);
  }

  function hits(paper, keywords, authors) {
    var text = (paper.title + ' ' + paper.abstract).toLowerCase();
    var names = String(paper.authors || '').toLowerCase();
    return keywords.filter(function (word) { return text.includes(word); }).length +
      authors.filter(function (name) { return names.includes(name); }).length;
  }

  function card(paper, saved, score) {
    var escape = context.escape;
    var button = saved ? 'Remove from reading list' : 'Save for reading';
    var projects = saved ? '<label>Project <select data-project="' + escape(paper.id) + '"><option value="">No project</option>' +
      context.state().grants.map(function (project) {
        return '<option value="' + escape(project.id) + '"' + (project.id === saved.project ? ' selected' : '') +
          '>' + escape(project.name) + '</option>';
      }).join('') + '</select></label>' : '';
    return '<article class="card"><div class="row"><strong><a target="_blank" rel="noopener" href="https://arxiv.org/abs/' +
      escape(paper.id) + '">' + escape(paper.title) + '</a></strong></div><p class="mu">' +
      escape([paper.authors, paper.date, (paper.categories || []).join(', ')].filter(Boolean).join(' · ')) +
      (score ? ' · Matches your interests' : '') + '</p>' +
      (paper.abstract ? '<details><summary>Original abstract</summary><p>' + escape(paper.abstract) + '</p></details>' : '') +
      '<div class="sub"><button class="btn sm" type="button" data-paper="' + escape(paper.id) + '">' + button +
      '</button>' + projects + '</div></article>';
  }

  function render() {
    if (!root || root.classList.contains('hide')) return;
    var settings = state();
    var key = JSON.stringify([settings.categories, settings.keywords, settings.authors, settings.matches]);
    if (key !== preferenceKey) {
      preferenceKey = key;
      form.elements.keywords.value = settings.keywords;
      form.elements.authors.value = settings.authors;
      form.elements.matches.checked = settings.matches;
      form.querySelectorAll('[name="category"]').forEach(function (input) {
        input.checked = settings.categories.includes(input.value);
      });
    }
    root.querySelector('#radar-saved').innerHTML = settings.saved.map(function (paper) {
      var current = feed && feed.papers.find(function (item) { return item.id === paper.id; });
      return card(current || paper, paper, 0);
    }).join('') || '<p class="mu">Your reading list is empty.</p>';
    var status = root.querySelector('#radar-status');
    var output = root.querySelector('#radar-feed');
    if (!feed) {
      output.replaceChildren();
      status.textContent = failed ? 'The feed is unavailable. You can retry or browse directly on arXiv.' : 'Loading arXiv papers…';
      if (!loading && !failed) load();
      return;
    }
    var keywords = terms(settings.keywords);
    var authors = terms(settings.authors);
    var saved = new Set(settings.saved.map(function (paper) { return paper.id; }));
    var items = feed.papers.filter(function (paper) {
      return idPattern.test(paper.id) && !saved.has(paper.id) &&
        paper.categories.some(function (category) { return settings.categories.includes(category); });
    }).map(function (paper) {
      return {paper: paper, score: hits(paper, keywords, authors)};
    }).filter(function (item) {
      return !settings.matches || (!keywords.length && !authors.length) || item.score;
    }).sort(function (a, b) { return b.score - a.score; });
    var dates = settings.categories.map(function (category) { return feed.categories[category]; }).filter(Boolean).sort();
    status.textContent = items.length + ' paper(s) · Feed checked ' + feed.updated +
      (dates.length ? ' · Latest arXiv issue ' + dates[dates.length - 1] : '');
    output.innerHTML = items.slice(0, limit).map(function (item) {
      return card(item.paper, null, item.score);
    }).join('') || '<p class="mu">No papers match your settings.</p>';
    if (items.length > limit) output.insertAdjacentHTML('beforeend',
      '<button class="btn" type="button" data-more>Show more</button>');
  }

  async function load() {
    if (loading) return;
    loading = true;
    failed = false;
    render();
    try {
      var response = await fetch(feedUrl, {cache: 'no-cache'});
      if (!response.ok) throw new Error('Feed unavailable');
      var result = await response.json();
      if (!Array.isArray(result.papers) || !result.categories) throw new Error('Invalid feed');
      feed = result;
    } catch (error) {
      feed = null;
      failed = true;
    } finally {
      loading = false;
      render();
    }
  }

  function save(settings) {
    context.state().radar = settings;
    context.save();
    render();
  }

  function init(options) {
    context = options;
    root = document.getElementById('arxiv-radar');
    form = root.querySelector('form');
    form.querySelector('fieldset').innerHTML = '<legend>arXiv categories</legend>' + categories.map(function (category) {
      return '<label><input style="width:auto" type="checkbox" name="category" value="' + category + '"> ' + category + '</label>';
    }).join('');
    form.onsubmit = function (event) {
      event.preventDefault();
      var settings = state();
      settings.categories = new FormData(form).getAll('category');
      settings.keywords = form.elements.keywords.value.trim();
      settings.authors = form.elements.authors.value.trim();
      settings.matches = form.elements.matches.checked;
      limit = 25;
      save(settings);
    };
    root.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-refresh')) { load(); return; }
      if (button.hasAttribute('data-more')) { limit += 25; render(); return; }
      var id = button.dataset.paper;
      if (!id) return;
      var settings = state();
      var index = settings.saved.findIndex(function (paper) { return paper.id === id; });
      if (index >= 0) settings.saved.splice(index, 1);
      else {
        var paper = feed && feed.papers.find(function (item) { return item.id === id; });
        if (!paper) return;
        var saved = {id: paper.id, title: paper.title, authors: paper.authors, date: paper.date,
          categories: paper.categories, project: ''};
        settings.saved.unshift(saved);
      }
      save(settings);
    });
    root.addEventListener('change', function (event) {
      var id = event.target.dataset.project;
      if (!id) return;
      var settings = state();
      var paper = settings.saved.find(function (item) { return item.id === id; });
      if (paper) { paper.project = event.target.value; save(settings); }
    });
  }

  window.PlannerRadar = {init: init, render: render};
}());

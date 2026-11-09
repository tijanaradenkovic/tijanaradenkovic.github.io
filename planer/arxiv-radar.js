(function () {
  'use strict';

  var categories = ['gr-qc', 'hep-th', 'math-ph', 'math.QA', 'quant-ph'];
  var feedUrl = 'https://raw.githubusercontent.com/tijanaradenkovic/tijanaradenkovic.github.io/planner-arxiv-data/feed.json';
  var preferenceKey, feed, loading = false, failed = false, limit = 8, context, root, form;
  var worker, semantic = {}, ranking = false, rankingError = false, feedVersion = 0, semanticKey = '';
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

  var stopWords = new Set('about across also based between both can from have into more over show some such than that their them these this those under used using very were what when where which while will with within work'.split(' '));

  function words(text) {
    return new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(function (word) {
      return !stopWords.has(word);
    }));
  }

  function relevance(paper, keywords, authors, publications) {
    var text = (paper.title + ' ' + paper.abstract).toLowerCase();
    var names = String(paper.authors || '').toLowerCase();
    var exact = keywords.filter(function (word) { return text.includes(word); }).length;
    var author = authors.some(function (name) { return names.includes(name); });
    var tokens = words(text);
    var overlap = publications.reduce(function (best, title) {
      var common = [...title].filter(function (word) { return tokens.has(word); }).length;
      return Math.max(best, common >= 2 ? common / title.size : 0);
    }, 0);
    return {
      exact: exact || author,
      score: Math.min(100, (author ? 60 : 0) + Math.min(50, exact * 30) + 50 * overlap)
    };
  }

  function rankWithModel(profile, candidates, key) {
    if (worker) worker.terminate();
    ranking = true;
    rankingError = false;
    function finish(data) {
      if (semanticKey !== key) return;
      if (worker) worker.terminate();
      worker = null;
      ranking = false;
      rankingError = !data.scores;
      semantic = Object.fromEntries(data.scores || []);
      render();
    }
    try {
      worker = new Worker('arxiv-embedding.js', {type: 'module'});
      worker.onmessage = function (event) { finish(event.data); };
      worker.onerror = function () { finish({}); };
      worker.postMessage({profile: profile, papers: candidates.slice(0, 40).map(function (item) {
        return {id: item.paper.id, text: (item.paper.title + '. ' + item.paper.abstract).slice(0, 1800)};
      })});
    } catch {
      finish({});
    }
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
      (score ? ' · Relevance ' + Math.round(score) + '/100' : '') + '</p>' +
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
    var papers = context.state().papers || [];
    var publications = [...new Set(papers.filter(function (paper) {
      return ['Accepted', 'Published'].includes(paper.stage) && paper.title;
    }).map(function (paper) { return paper.title.trim(); }).filter(Boolean))].slice(-20);
    var publicationWords = publications.map(words);
    var profile = keywords.slice(0, 20).concat(publications);
    var personalized = profile.length || authors.length;
    var rankingKey = JSON.stringify([preferenceKey, profile, feedVersion]);
    if (rankingKey !== semanticKey) {
      if (worker) worker.terminate();
      worker = null;
      ranking = rankingError = false;
      semantic = {};
      semanticKey = rankingKey;
    }
    var saved = new Set(settings.saved.map(function (paper) { return paper.id; }));
    var candidates = feed.papers.filter(function (paper) {
      return idPattern.test(paper.id) && !saved.has(paper.id) &&
        paper.categories.some(function (category) { return settings.categories.includes(category); });
    }).map(function (paper) {
      var match = relevance(paper, keywords, authors, publicationWords);
      return {paper: paper, score: match.score, exact: match.exact};
    }).sort(function (a, b) { return b.score - a.score; });
    var modelButton = root.querySelector('[data-semantic]');
    modelButton.disabled = ranking || !profile.length || !candidates.length;
    modelButton.onclick = function () {
      rankWithModel(profile, candidates, rankingKey);
      render();
    };
    var items = candidates.map(function (item) {
      var similarity = semantic[item.paper.id] || 0;
      var score = Math.min(100, Math.max(item.score, similarity >= 0.35 ? 100 * similarity + 0.2 * item.score : 0));
      return {paper: item.paper, exact: item.exact, score: score};
    }).filter(function (item) {
      if (!personalized) return true;
      return settings.matches && (keywords.length || authors.length) ? item.exact : item.score >= 25;
    }).sort(function (a, b) { return b.score - a.score; });
    var dates = settings.categories.map(function (category) { return feed.categories[category]; }).filter(Boolean).sort();
    status.textContent = 'Showing ' + Math.min(limit, items.length) + ' of ' + items.length + ' paper(s)' +
      (ranking ? ' · Calculating semantic similarity…' : rankingError ? ' · AI model unavailable. Using text relevance.' :
        Object.keys(semantic).length ? ' · AI checked ' + Object.keys(semantic).length + ' candidates' : '') +
      ' · Feed checked ' + feed.updated +
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
      feedVersion += 1;
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
      limit = 8;
      save(settings);
    };
    root.addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-refresh')) { load(); return; }
      if (button.hasAttribute('data-more')) { limit += 8; render(); return; }
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

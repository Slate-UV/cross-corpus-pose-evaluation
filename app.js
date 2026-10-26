'use strict';

(() => {
  const study = window.PROJECT_STUDY;
  if (!study) return;
  const $ = (selector) => document.querySelector(selector);
  const datasets = Object.fromEntries(study.datasets.map((d) => [d.id, d]));
  const names = {mre: 'Overall alignment', body: 'Body alignment', face: 'Face alignment', left_hand: 'Left-hand alignment', right_hand: 'Right-hand alignment'};
  const regions = ['mre', 'body', 'face', 'left_hand', 'right_hand'];
  const format = (number) => number.toFixed(2);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class Comparison {
    constructor(prefix, videoIds) {
      this.videos = videoIds.map((id) => document.getElementById(id));
      this.button = document.getElementById(prefix + '-play');
      this.progress = document.getElementById(prefix + '-progress');
      this.time = document.getElementById(prefix + '-time');
      this.playing = false;
      this.revision = 0;
      this.button.addEventListener('click', () => this.playing ? this.pause() : this.play());
      this.progress.addEventListener('input', () => this.seek(Number(this.progress.value) / 1000));
      document.getElementById(prefix + '-replay').addEventListener('click', () => { this.seek(0); this.play(); });
      this.videos[0].addEventListener('ended', () => { if (this.playing) { this.seek(0); this.play(); } });
      this.videos.forEach((video) => { video.muted = true; video.playsInline = true; });
      this.videos[0].addEventListener('timeupdate', () => this.update());
    }

    duration() {
      const durations = this.videos.map((video) => video.duration).filter(Number.isFinite);
      return durations.length ? Math.min(...durations) : 0;
    }

    async setMedia(media, autoplay = false) {
      this.pause();
      const revision = ++this.revision;
      this.progress.value = 0;
      this.time.textContent = '0:00';
      this.videos.forEach((video, index) => {
        video.poster = media[index].poster;
        video.src = media[index].video;
        video.load();
      });
      if (autoplay && revision === this.revision) await this.play();
    }

    async play() {
      const revision = this.revision;
      this.playing = true;
      this.renderButton();
      try {
        await Promise.all(this.videos.map((video) => video.play()));
        if (revision !== this.revision || !this.playing) return;
        clearInterval(this.clock);
        this.clock = setInterval(() => this.update(), 80);
      } catch (error) {
        if (revision === this.revision && error.name !== 'AbortError') this.pause();
      }
    }

    pause() {
      this.playing = false;
      clearInterval(this.clock);
      this.videos.forEach((video) => video.pause());
      this.renderButton();
    }

    renderButton() {
      this.button.querySelector('.play-icon').textContent = this.playing ? 'Ⅱ' : '▶';
      this.button.querySelector('.play-text').textContent = this.playing ? 'Pause comparison' : 'Play comparison';
      this.button.setAttribute('aria-label', this.playing ? 'Pause synchronized comparison' : 'Play synchronized comparison');
    }

    seek(fraction) {
      const duration = this.duration();
      if (!duration) return;
      const time = Math.max(0, Math.min(duration - .02, fraction * duration));
      this.videos.forEach((video) => { if (video.readyState >= 1) video.currentTime = time; });
      this.progress.value = Math.round(time / duration * 1000);
      this.showTime(time);
    }

    showTime(seconds) {
      this.time.textContent = Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
    }

    update() {
      const duration = this.duration();
      const master = this.videos[0];
      const time = master.currentTime || 0;
      if (this.playing && duration > 0 && time >= duration - .045) {
        this.seek(0);
        this.videos.forEach((video) => { const play = video.play(); if (play) play.catch(() => {}); });
        return;
      }
      if (this.playing) this.videos.slice(1).forEach((video) => {
        if (video.readyState >= 2 && Math.abs(video.currentTime - time) > .1) video.currentTime = time;
      });
      this.progress.value = duration ? Math.round(time / duration * 1000) : 0;
      this.showTime(time);
    }
  }

  const hero = new Comparison('demo', ['demo-original', 'demo-mesh']);
  const alignment = new Comparison('alignment', ['alignment-original', 'alignment-before', 'alignment-after']);
  const pilot = new Comparison('pilot', ['pilot-original', 'pilot-mesh']);
  let demoDataset = 'lsch';
  let demoMethod = 'PEAR';
  let resultDataset = 'phoenix';
  let resultMetric = 'mre';

  function selectTab(container, id) {
    document.querySelectorAll(container + ' button').forEach((button) => {
      const active = button.dataset.dataset === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderDemo(autoplay = false) {
    const dataset = datasets[demoDataset];
    const method = dataset.methods[demoMethod];
    hero.setMedia([{video: dataset.source, poster: dataset.poster}, method], autoplay);
    $('#demo-reconstruction-label').textContent = demoMethod + ' reconstruction';
    $('#demo-caption').textContent = dataset.language + ' · ' + dataset.name;
    $('#demo-original').setAttribute('aria-label', 'Original ' + dataset.language + ' recording');
    $('#demo-mesh').setAttribute('aria-label', demoMethod + ' reconstruction of the same ' + dataset.language + ' sequence');
    $('.hero-pair').style.setProperty('--pair-ratio', String(dataset.width / dataset.height));
    selectTab('#demo-tabs', demoDataset);
  }

  $('#demo-method').replaceChildren(...study.methods.map((method) => {
    const option = document.createElement('option');
    option.value = method.name;
    option.textContent = method.name;
    return option;
  }));
  $('#demo-method').value = demoMethod;
  $('#demo-method').addEventListener('change', (event) => { demoMethod = event.target.value; renderDemo(hero.playing); });
  $('#demo-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    demoDataset = button.dataset.dataset;
    renderDemo(hero.playing);
  });

  $('#method-grid').innerHTML = study.methods.map((method) => {
    const media = datasets.lsch.methods[method.name];
    return `<article class="method-card"><div class="method-image"><img src="${media.poster}" alt="${method.name} reconstruction of the same Chilean Sign Language frame" width="400" height="340" loading="lazy"><span class="method-input">${method.input}</span></div><div class="method-card-text"><h3>${method.name}</h3><div class="method-actions"><button type="button" data-method="${method.name}" aria-label="Compare ${method.name} with the original video">Compare ↑</button>${method.paper ? `<a href="${method.paper}" target="_blank" rel="noopener" aria-label="Read the ${method.name} research paper">Paper ↗</a>` : ''}</div></div></article>`;
  }).join('');
  $('#method-grid').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-method]');
    if (!button) return;
    demoMethod = button.dataset.method;
    demoDataset = 'lsch';
    $('#demo-method').value = demoMethod;
    renderDemo(!reducedMotion);
    $('#comparison').scrollIntoView({behavior: reducedMotion ? 'instant' : 'smooth', block: 'start'});
    $('#demo-method').focus({preventScroll: true});
  });

  const datasetInfo = {
    lsch: {title: 'LSCh · OF-HMR', description: 'Controlled recordings of Chilean Sign Language, evaluated from a single view.', link: '#comparison', label: 'Explore the recordings ↑'},
    phoenix: {title: 'PHOENIX-2014-T', description: 'Weather interpretation with small, tightly framed images.', link: 'https://www-i6.informatik.rwth-aachen.de/~koller/RWTH-PHOENIX-2014-T/', label: 'About the dataset ↗'},
    csl: {title: 'CSL-Daily', description: 'Everyday topics, natural signing and frequent hand–body interaction.', link: 'https://ustc-slr.github.io/datasets/2021_csl_daily/', label: 'About the dataset ↗'}
  };
  $('#dataset-grid').innerHTML = study.datasets.map((dataset) => {
    const info = datasetInfo[dataset.id];
    return `<article class="dataset-card"><div class="dataset-image"><img src="${dataset.poster}" alt="Example ${dataset.language} recording in ${dataset.name}" width="400" height="300" loading="lazy"><span class="dataset-country">${dataset.country}</span></div><div class="dataset-card-content"><h3>${info.title}</h3><p class="dataset-language">${dataset.language}</p><p class="dataset-description">${info.description}</p><div class="dataset-meta"><span><strong>${dataset.n}</strong> evaluated sequences</span><span>${dataset.width} × ${dataset.height} · ${dataset.fps} fps</span></div><a href="${info.link}" ${dataset.id === 'lsch' ? '' : 'target="_blank" rel="noopener"'}>${info.label}</a></div></article>`;
  }).join('');

  function renderAlignment(id, autoplay = false) {
    const dataset = datasets[id];
    alignment.setMedia([{video: dataset.source, poster: dataset.poster}, {video: dataset.before, poster: dataset.beforePoster}, dataset.methods['Multi-HMR']], autoplay);
    selectTab('#alignment-tabs', id);
  }
  $('#alignment-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) renderAlignment(button.dataset.dataset, alignment.playing);
  });

  function renderResults() {
    const dataset = datasets[resultDataset];
    const scores = dataset.scores;
    const sorted = study.methods.slice().sort((a, b) => scores[a.name][resultMetric].mean - scores[b.name][resultMetric].mean);
    const maximum = Math.max(...sorted.map((method) => scores[method.name][resultMetric].mean));
    const best = sorted[0].name;
    $('#chart-title').textContent = names[resultMetric];
    $('#chart-subtitle').textContent = dataset.name + ' · ' + scores[best][resultMetric].n + ' sequences';
    $('#result-chart').innerHTML = sorted.map((method, index) => {
      const mean = scores[method.name][resultMetric].mean;
      return `<div class="chart-row ${index === 0 ? 'best' : ''}"><span class="chart-name">${method.name}</span><div class="chart-track" aria-hidden="true"><div class="chart-fill" style="width:${mean / maximum * 100}%"></div></div><span class="chart-value">${format(mean)}</span></div>`;
    }).join('');
    $('#result-chart').setAttribute('aria-label', `${names[resultMetric]} in ${dataset.name}. Mean error in pixels, lower is better. ` + sorted.map((method) => `${method.name}: ${format(scores[method.name][resultMetric].mean)}`).join('; '));
    const text = resultDataset === 'csl'
      ? resultMetric === 'left_hand'
        ? '<strong>AiOS</strong> has the lowest left-hand mean: <strong>18.50 pixels</strong>. PEAR is close at 18.84 pixels; variation between sequences is large.'
        : '<strong>PEAR</strong> has the lowest overall, body, face and right-hand means. <strong>AiOS</strong> has the lowest left-hand mean.'
      : '<strong>PEAR</strong> has the lowest mean error in all five measures on the evaluated ' + (resultDataset === 'phoenix' ? 'PHOENIX' : 'LSCh') + ' sequences.';
    $('#result-finding').innerHTML = text;
    const minima = Object.fromEntries(regions.map((region) => [region, Math.min(...study.methods.map((method) => scores[method.name][region].mean))]));
    const rows = study.methods.slice().sort((a, b) => scores[a.name].mre.mean - scores[b.name].mre.mean);
    $('#results-table tbody').innerHTML = rows.map((method) => `<tr><td>${method.name}</td>${regions.map((region) => {
      const value = scores[method.name][region];
      return `<td class="${value.mean === minima[region] ? 'best-value' : ''}">${format(value.mean)} ± ${format(value.sd)}</td>`;
    }).join('')}</tr>`).join('');
    $('#results-caption').textContent = dataset.name + ' · ' + dataset.n + ' sequences · ' + dataset.frames.toLocaleString('en-US') + ' source frames';
    $('#measurement-note').textContent = resultDataset === 'csl'
      ? 'Left-hand results use 26 sequences with eligible observations; the other measures use all 29. Missing measurements are excluded.'
      : 'All ten methods are compared on the same ' + dataset.n + ' sequences and eligible reference observations. Bold values mark the lowest mean in each column.';
    selectTab('#result-tabs', resultDataset);
  }
  $('#result-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    resultDataset = button.dataset.dataset;
    renderResults();
  });
  $('#result-metric').addEventListener('change', (event) => { resultMetric = event.target.value; renderResults(); });

  const dialog = $('#pilot-dialog');
  $('#pilot-open').addEventListener('click', () => {
    hero.pause(); alignment.pause();
    dialog.showModal();
    pilot.setMedia([{video: study.pilot.video, poster: study.pilot.poster}, {video: study.pilot.reconstruction, poster: study.pilot.reconstructionPoster}], !reducedMotion);
  });
  $('#pilot-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => pilot.pause());
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) [hero, alignment, pilot].forEach((group) => group.pause()); });
  if ('IntersectionObserver' in window) {
    const mediaVisibility = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) return;
      if (entry.target.id === 'comparison') hero.pause();
      if (entry.target.id === 'alignment') alignment.pause();
    }), {threshold: .08});
    mediaVisibility.observe($('#comparison'));
    mediaVisibility.observe($('#alignment'));
    const sectionVisibility = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      document.querySelectorAll('.site-header nav a').forEach((link) => link.classList.toggle('active', link.hash === '#' + entry.target.id));
    }), {rootMargin: '-15% 0px -65% 0px', threshold: 0});
    ['methods', 'datasets', 'alignment', 'results'].forEach((id) => sectionVisibility.observe(document.getElementById(id)));
  }
  renderDemo(!reducedMotion);
  renderAlignment('csl');
  renderResults();
})();

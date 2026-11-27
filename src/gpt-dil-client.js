const gptDilPrograms = new Map();
let gptRemoteResources = (() => {
  try {
    return localStorage.getItem('cv-remote-resources') === '1';
  } catch {
    return false;
  }
})();

function gptStrictImgPolicy() {
  return !!document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content.includes('img-src blob: data:;');
}

function syncRemoteResourceControls() {
  const strict = gptStrictImgPolicy();
  const effective = gptRemoteResources && !strict;
  try {
    localStorage.setItem('cv-remote-resources', gptRemoteResources ? '1' : '0');
  } catch {}
  const headerBtn = document.getElementById('remote-resources-btn');
  if (headerBtn) {
    headerBtn.disabled = strict;
    headerBtn.classList.toggle('active', effective);
    headerBtn.setAttribute('aria-pressed', effective ? 'true' : 'false');
    headerBtn.textContent = '🌐 ' + t('远程资源') + ': ' + (effective ? t('开') : t('关'));
    headerBtn.title = strict
      ? t('离线包已禁用远程图片与地图')
      : t('开启时，外部图片与 OpenStreetMap 地图服务会收到请求');
  }
  document.querySelectorAll('[data-remote-choice]').forEach(btn => {
    const on = btn.dataset.remoteChoice === 'on';
    const active = on === effective;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.disabled = strict && on;
  });
  const statusEl = document.getElementById('welcome-remote-status');
  if (statusEl) {
    statusEl.textContent = strict
      ? t('当前为离线安全模式：远程图片与地图已禁用。')
      : effective
        ? t('已开启：阅读 ChatGPT 导出时将自动加载远程图片与 OpenStreetMap 地图底图。')
        : t('当前为仅本地模式（推荐）：不会向第三方图片或地图服务发送请求。');
  }
}

function setGptRemoteResources(enabled) {
  gptRemoteResources = !!enabled;
  syncRemoteResourceControls();
  if (currentConv && (currentConv.sourcePlatform === 'gpt' || document.querySelector('#messages [data-gpt-program], #messages .gpt-components'))) {
    if (typeof renderReaderWindow === 'function' && currentConv._readerBacked) {
      void renderReaderWindow();
    } else {
      for (const host of document.querySelectorAll('[data-gpt-program]')) {
        const entry = gptDilPrograms.get(host.dataset.gptProgram);
        if (entry) gptDilRefresh(host, entry);
      }
    }
  }
}

const gptTileObserver = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const tile = entry.target;
        const url = gptExportCore().safeUrl(tile.dataset.gptTile);
        if (url && gptRemoteResources && !gptStrictImgPolicy()) {
          tile.addEventListener('load', () => tile.setAttribute('opacity', '1'), { once: true });
          tile.addEventListener('error', () => tile.remove(), { once: true });
          tile.setAttribute('opacity', '0');
          tile.setAttribute('href', url);
        }
        gptTileObserver.unobserve(tile);
      }
    })
  : null;

const gptTileMutations = new MutationObserver(records => {
  for (const record of records) {
    for (const [nodes, added] of [[record.addedNodes, true], [record.removedNodes, false]]) {
      for (const node of nodes) {
        if (node.nodeType !== 1) continue;
        const tiles = [...(node.matches('[data-gpt-tile]') ? [node] : []), ...node.querySelectorAll('[data-gpt-tile]')];
        for (const tile of tiles) {
          if (added) {
            if (gptTileObserver) gptTileObserver.observe(tile);
            else if (gptRemoteResources && !gptStrictImgPolicy()) {
              tile.addEventListener('error', () => tile.remove(), { once: true });
              tile.setAttribute('href', gptExportCore().safeUrl(tile.dataset.gptTile) || '');
            }
          } else {
            gptTileObserver?.unobserve(tile);
          }
        }
      }
    }
  }
});
gptTileMutations.observe(document.documentElement, { childList: true, subtree: true });

function gptExportStates(uuid) {
  const values = Object.create(null);
  for (const [key, entry] of gptDilPrograms) {
    const [generation, conversation, location] = JSON.parse(key);
    if (generation === dataWorkerGeneration && conversation === uuid) values[location] = entry.state;
  }
  return values;
}

function renderGptProgram(block, location = '') {
  const key = JSON.stringify([dataWorkerGeneration, currentConv?.uuid, location]);
  const cached = gptComponentState(key);
  if (!cached.values) cached.values = structuredClone(block.gptProgram.initial);
  const program = block.gptProgram;
  if (program.snapshot) return buildGptProgram(key, program, {}).outerHTML;
  gptDilPrograms.delete(key);
  gptDilPrograms.set(key, { program, state: cached.values });
  while (gptDilPrograms.size > 32) {
    gptDilPrograms.delete(gptDilPrograms.keys().next().value);
  }
  return buildGptProgram(key, program, cached.values).outerHTML;
}

function buildGptProgram(key, program, state) {
  const core = gptDilCore();
  const materialized = core.materialize(program, state);
  const host = document.createElement('div');
  host.className = 'gpt-dil';
  host.dataset.gptProgram = key;
  const mediaAllowed = gptRemoteResources && !program._redactedMedia && !gptStrictImgPolicy();
  const add = (parent, tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    parent.append(node);
    return node;
  };
  const safe = value => gptExportCore().safeUrl(value);
  const entities = program.context.entities || {};
  const link = (parent, title, url, cls = 'gpt-inline-link') => {
    const href = safe(url);
    if (!href) return add(parent, 'span', title);
    const anchor = add(parent, 'a', title);
    if (cls) anchor.className = cls;
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.referrerPolicy = 'no-referrer';
    return anchor;
  };
  const missing = (parent, name, field) => {
    const details = add(parent, 'details');
    details.className = 'gpt-dil-missing';
    add(details, 'summary', name + ' · ' + t('导出数据缺失'));
    add(details, 'p', field);
  };
  const svgNode = (tag, attrs = {}, text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const image = (parent, url, title, attrs = {}) => {
    if (!safe(url) || !mediaAllowed) return false;
    const img = add(parent, 'img');
    img.src = safe(url);
    img.alt = title || '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.style.maxWidth = '100%';
    if (/^[\d.]+:[\d.]+$/.test(attrs.aspectRatio || '')) {
      img.style.aspectRatio = attrs.aspectRatio.replace(':', ' / ');
    }
    img.style.objectFit = 'cover';
    return true;
  };
  const resolve = id => (typeof id === 'string' && Object.hasOwn(entities, id) ? entities[id] : null);
  const colors = {
    secondary: 'var(--text2)',
    subtle: 'var(--border)',
    warning: 'var(--orange)',
    danger: 'var(--red)',
    success: 'var(--green)',
    'surface-tertiary': 'var(--bg3)',
    'surface-inverted': 'var(--text)'
  };
  const dimension = value => (
    typeof value === 'number'
      ? Math.max(0, Math.min(1200, value)) * 4 + 'px'
      : typeof value === 'string' && /^(?:\d+(?:\.\d+)?)(?:px|%|rem|em)$/.test(value)
        ? value
        : ''
  );

  function styles(node, attrs, name) {
    if (name === 'box') node.style.alignItems = attrs.align || 'stretch';
    if (name === 'row') node.style.alignItems = attrs.align || 'center';
    if (name === 'badge') node.style.alignSelf = 'flex-start';
    if (attrs.direction === 'row') node.style.flexDirection = 'row';
    if (attrs.direction === 'col') node.style.flexDirection = 'column';
    node.classList.add('gpt-dil-' + name);
    if (attrs.border) node.style.border = '1px solid var(--border)';
    if (attrs.radius) node.style.borderRadius = ({ lg: '12px', full: '999px', md: '8px', sm: '4px' })[attrs.radius] || '4px';
    if (attrs.padding != null) node.style.padding = dimension(attrs.padding);
    if (attrs.gap != null) node.style.gap = dimension(attrs.gap);
    for (const property of ['width', 'height', 'maxWidth']) {
      if (dimension(attrs[property])) node.style[property] = dimension(attrs[property]);
    }
    if (attrs.flex === '1' || attrs.flex === 1) node.style.flex = '1';
    if (attrs.clip) node.style.overflow = 'hidden';
    if (attrs.block) node.style.width = '100%';
    if (colors[attrs.color]) node.style.color = colors[attrs.color];
    if (colors[attrs.background]) node.style.background = colors[attrs.background];
    if (['center', 'start', 'end', 'stretch'].includes(attrs.align)) node.style.alignItems = attrs.align;
    if (['between', 'center', 'start', 'end'].includes(attrs.justify)) {
      node.style.justifyContent = attrs.justify === 'between' ? 'space-between' : attrs.justify;
    }
    if (attrs.size) node.style.fontSize = ({ xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '18px' })[attrs.size] || '';
    if (attrs.weight) node.style.fontWeight = ({ medium: '500', semibold: '600', bold: '700' })[attrs.weight] || '';
    if (attrs.tabularNums) node.style.fontVariantNumeric = 'tabular-nums';
    if (name === 'grid') node.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.min(6, Number(attrs.columns) || 2)) + ', minmax(0, 1fr))';
  }

  let eventIndex = 0;
  let groupIndex = 0;
  const events = [];
  const bind = (node, event, component, kind) => {
    const index = eventIndex++;
    node.dataset.gptDilEvent = String(index);
    node.dataset.gptDilKind = kind;
    events[index] = { event, locals: component.locals };
  };

  function render(nodes, parent, radioGroup = null) {
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const component = nodes[nodeIndex];
      if (
        component.kind === 'markdown'
        && /\*\*$/.test(component.text)
        && nodes[nodeIndex + 1]?.name === 'Entity'
        && nodes[nodeIndex + 2]?.kind === 'markdown'
        && nodes[nodeIndex + 2].text.startsWith('**')
      ) {
        const before = component.text.slice(0, -2);
        if (before.trim()) render([{ kind: 'markdown', text: before }], parent, radioGroup);
        const strong = add(parent, 'strong');
        render([nodes[nodeIndex + 1]], strong, radioGroup);
        const after = nodes[nodeIndex + 2].text.slice(2);
        if (after.trim()) render([{ kind: 'markdown', text: after }], parent, radioGroup);
        nodeIndex += 2;
        continue;
      }
      if (component.kind === 'legacy') {
        const node = add(parent, 'div');
        node.innerHTML = renderGptViews({ gptViews: component.views, _redactedMedia: program._redactedMedia }, key + ':' + eventIndex++);
        continue;
      }
      if (component.kind === 'markdown') {
        if (!component.text.trim()) continue;
        const inline = ['SPAN', 'LABEL', 'BUTTON', 'H4', 'SMALL', 'MARK'].includes(parent.tagName);
        const node = add(parent, inline ? 'span' : 'div');
        node.className = 'gpt-dil-markdown';
        if (inline && component._inlineHtml) node.innerHTML = component._inlineHtml;
        else if (inline) node.textContent = component.text;
        else node.innerHTML = component._html || renderMd(component.text);
        continue;
      }
      if (component.kind === 'error') {
        missing(parent, t('组件未还原'), component.detail);
        if (component.source) add(parent, 'pre', component.source);
        continue;
      }
      if (component.kind !== 'element') continue;

      const name = component.name;
      const attrs = component.attrs || {};
      const plain = core.summary(component.children || []);
      const reference = resolve(attrs.ref);
      const entity = reference?.entity || reference;

      if (name === 'Entity') {
        add(parent, 'span', typeof attrs.value === 'string' ? attrs.value : entity?.name || entity?.title || attrs.ref || t('实体数据缺失'));
        continue;
      }
      if (name === 'Cite') {
        const span = add(parent, 'span');
        span.className = 'gpt-dil-cite-group';
        for (const id of Array.isArray(attrs.refs) ? attrs.refs : []) {
          const source = resolve(id);
          if (source) link(span, '[' + (source.title || source.name || id) + ']', source.url || source.website_url || source.entity?.website_url);
          else missing(span, 'Cite', id);
        }
        continue;
      }
      if (name === 'Link') {
        link(parent, attrs.title || entity?.title || entity?.name || attrs.url || attrs.ref || plain, attrs.url || entity?.url || entity?.website_url);
        continue;
      }
      if (name === 'Rating') {
        const value = attrs.data ?? entity?.rating;
        const span = add(parent, 'span');
        span.className = 'gpt-dil-rating';
        if (value != null) {
          add(
            span,
            'span',
            '★ ' + (typeof value === 'object' ? value.value ?? value.rating ?? '' : value)
              + (entity?.rating_scale ? ' / ' + entity.rating_scale : '')
              + (entity?.review_count ? ' (' + entity.review_count + ')' : '')
          );
        } else {
          missing(span, 'Rating', attrs.ref || 'rating');
        }
        continue;
      }
      if (name === 'AsyncImage' || name === 'AsyncImageGroup') {
        const figure = add(parent, 'figure');
        styles(figure, attrs, name);
        const queries = Array.isArray(attrs.query) ? attrs.query : [attrs.query || ''];
        const matching = (program.context.images || []).filter(item => queries.includes(item.query));
        const urls = attrs.url ? [{ url: attrs.url, title: queries.join(' · ') }] : matching;
        if (urls.length) {
          for (const item of urls.slice(0, 20)) {
            if (!image(figure, item.url, item.title || queries.join(' · '), attrs)) {
              const row = add(figure, 'div');
              row.className = 'gpt-dil-media-fallback';
              add(row, 'span', item.title || queries.join(' · '));
              link(row, t('打开链接'), item.url);
            }
          }
        } else {
          for (const query of queries.slice(0, 20)) {
            const caption = add(figure, 'figcaption');
            caption.className = 'gpt-dil-media-fallback';
            add(caption, 'span', t('导出仅包含图片搜索词：') + query);
            link(caption, t('搜索图片'), 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(query));
          }
        }
        continue;
      }
      if (name === 'Chart') {
        const chart = attrs.content && typeof attrs.content === 'object' ? attrs.content : {};
        const data = (Array.isArray(chart.data) ? chart.data.slice(0, 500) : []).filter(row => row && typeof row === 'object');
        const series = (Array.isArray(chart.series) ? chart.series.slice(0, 12) : []).filter(item => item && typeof item === 'object');
        const card = add(parent, 'figure');
        card.className = 'gpt-dil-chart';
        add(card, 'figcaption', chart.meta?.title || t('图表'));
        if (chart.meta?.description) add(card, 'p', chart.meta.description).className = 'gpt-card-desc';
        if (chart.chartType === 'bar') {
          const minimum = Number.isFinite(chart.yAxisMin) ? chart.yAxisMin : 0;
          const values = data.flatMap(row => series.map(item => Number(row[item.dataKey]))).filter(Number.isFinite);
          const maximum = Math.max(minimum + 1, Number(chart.yAxisMax) || Math.max(...values, 1));
          const rowHeight = Math.max(36, series.length * 18 + 16);
          const height = Math.max(56, data.length * rowHeight + 16);
          const svg = svgNode('svg', { viewBox: '0 0 640 ' + height, role: 'img', 'aria-label': chart.meta?.title || 'Bar chart' });
          svg.classList.add('gpt-dil-chart-svg');
          const palette = ['var(--accent)', 'var(--blue)', 'var(--green)'];
          card.append(svg);
          data.forEach((row, index) => {
            const top = index * rowHeight + 10;
            svg.append(svgNode('text', { x: 4, y: top + 14, fill: 'currentColor', 'font-size': 12 }, row[chart.xKey] ?? ''));
            series.forEach((item, seriesIndex) => {
              const value = Number(row[item.dataKey]);
              if (!Number.isFinite(value)) return;
              const y = top + seriesIndex * 18;
              svg.append(svgNode('rect', { x: 165, y, width: Math.max(0, 410 * (value - minimum) / (maximum - minimum)), height: 14, rx: 3, fill: palette[seriesIndex % palette.length] }));
              svg.append(svgNode('text', { x: 585, y: y + 11, fill: 'currentColor', 'font-size': 11 }, value));
            });
          });
          add(card, 'p', minimum + ' — ' + maximum + ' · ' + series.map(item => item.label || item.dataKey).join(' / ')).className = 'gpt-card-muted';
        } else {
          missing(card, 'Chart', 'chartType: ' + chart.chartType);
        }
        if (data.length) {
          const table = add(card, 'table');
          const head = add(table, 'tr');
          add(head, 'th', chart.xKey || '');
          for (const item of series) add(head, 'th', item.label || item.dataKey || '');
          for (const row of data) {
            const tr = add(table, 'tr');
            add(tr, 'td', row[chart.xKey] ?? '');
            for (const item of series) add(tr, 'td', row[item.dataKey] ?? '');
          }
        }
        continue;
      }
      if (name === 'MapWidgetV2') {
        const card = add(parent, 'section');
        card.className = 'gpt-dil-map';
        add(card, 'h4', attrs.title || t('地图'));
        const points = (attrs.points || []).slice(0, 200).map(point => ({ ...resolve(point.ref), ...point }));
        const valid = points.filter(
          point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 85.0511 && Math.abs(point.longitude) <= 180
        );
        const byId = new Map(points.map(point => [point.ref || point.id, point]));
        if (valid.length) {
          const project = point => [(point.longitude + 180) / 360, (1 - Math.asinh(Math.tan(point.latitude * Math.PI / 180)) / Math.PI) / 2];
          const coords = valid.map(project);
          let zoom = 8;
          const minX = Math.min(...coords.map(p => p[0]));
          const maxX = Math.max(...coords.map(p => p[0]));
          const minY = Math.min(...coords.map(p => p[1]));
          const maxY = Math.max(...coords.map(p => p[1]));
          while (zoom > 2 && ((maxX - minX) * 256 * 2 ** zoom > 480 || (maxY - minY) * 256 * 2 ** zoom > 220)) zoom--;
          const scale = 256 * 2 ** zoom;
          const centerX = (minX + maxX) / 2 * scale;
          const centerY = (minY + maxY) / 2 * scale;
          const offsetX = centerX - 300;
          const offsetY = centerY - 130;
          const svg = svgNode('svg', { viewBox: '0 0 600 260', role: 'img', 'aria-label': t('地点与路线顺序') });
          svg.classList.add('gpt-dil-map-svg');
          for (const y of [65, 130, 195]) {
            svg.append(svgNode('line', { x1: 0, x2: 600, y1: y, y2: y, stroke: 'var(--border)', 'stroke-dasharray': '3 3' }));
          }
          for (const x of [150, 300, 450]) {
            svg.append(svgNode('line', { x1: x, x2: x, y1: 0, y2: 260, stroke: 'var(--border)', 'stroke-dasharray': '3 3' }));
          }
          card.append(svg);
          if (mediaAllowed && navigator.onLine) {
            for (let tileX = Math.floor(offsetX / 256); tileX <= Math.floor((offsetX + 600) / 256); tileX++) {
              for (let tileY = Math.floor(offsetY / 256); tileY <= Math.floor((offsetY + 260) / 256); tileY++) {
                if (tileX < 0 || tileY < 0 || tileX >= 2 ** zoom || tileY >= 2 ** zoom) continue;
                const tile = svgNode('image', {
                  x: tileX * 256 - offsetX,
                  y: tileY * 256 - offsetY,
                  width: 256,
                  height: 256,
                  'data-gpt-tile': 'https://tile.openstreetmap.org/' + zoom + '/' + tileX + '/' + tileY + '.png',
                  referrerpolicy: 'no-referrer'
                });
                svg.append(tile);
              }
            }
            link(card, '© OpenStreetMap contributors', 'https://www.openstreetmap.org/copyright');
          }
          const path = coords.map(point => (point[0] * scale - offsetX) + ',' + (point[1] * scale - offsetY)).join(' ');
          if (attrs.show_route) {
            svg.append(svgNode('polyline', { points: path, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2.5, 'stroke-dasharray': '5 4' }));
          }
          coords.forEach((point, index) => {
            const cx = point[0] * scale - offsetX;
            const cy = point[1] * scale - offsetY;
            svg.append(svgNode('circle', { cx, cy, r: 10, fill: 'var(--blue)' }));
            svg.append(svgNode('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', fill: '#fff', 'font-size': 11, 'font-weight': '600' }, index + 1));
            const labelText = valid[index]?.name || valid[index]?.title || '';
            if (labelText) {
              const flip = cx > 440;
              svg.append(svgNode('text', {
                x: flip ? cx - 14 : cx + 14,
                y: cy + 4,
                ...(flip ? { 'text-anchor': 'end' } : {}),
                fill: 'currentColor',
                'font-size': 11
              }, labelText.slice(0, 20)));
            }
          });
          add(card, 'p', t('顺序连线，不代表道路导航路径')).className = 'gpt-card-muted';
        }
        const list = add(card, 'ol');
        list.className = 'gpt-dil-map-list';
        for (const point of points) {
          const row = add(list, 'li');
          const titleLine = add(row, 'div');
          titleLine.className = 'gpt-dil-map-title';
          add(titleLine, 'strong', ((point.icon || '') + ' ' + (point.name || point.title || point.ref || point.id)).trim());
          link(titleLine, t('查看地点'), 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(point.address || point.name || ''));
          if (point.address) add(row, 'p', point.address).className = 'gpt-card-desc';
          if (point.description) add(row, 'p', point.description).className = 'gpt-card-desc';
          if (!point.name && !point.title) missing(row, 'MapWidgetV2', point.ref || point.id);
        }
        for (const group of attrs.groups || []) {
          add(card, 'h5', group.title);
          const groupList = add(card, 'ol');
          for (const item of group.locations || []) {
            const point = byId.get(item.point_id);
            add(groupList, 'li', item.notes || point?.name || item.point_id);
          }
        }
        const destination = points.at(-1);
        if (destination) {
          const footer = add(card, 'div');
          footer.className = 'gpt-dil-map-footer';
          link(
            footer,
            t('外部路线'),
            'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(attrs.origin || points[0]?.address || '')
              + '&destination=' + encodeURIComponent(destination.address || destination.name || '')
              + '&travelmode=driving'
          );
        }
        continue;
      }
      if (name === 'ReservationTimePillsRefWidget') {
        const card = add(parent, 'section');
        card.className = 'gpt-dil-reservations';
        add(card, 'strong', entity?.name || attrs.ref);
        add(card, 'p', t('历史订位快照，不代表实时可订')).className = 'gpt-card-muted';
        const reservations = reference?.reservations || entity?.reservations || entity?.reservation_providers || [];
        const pills = add(card, 'div');
        pills.className = 'gpt-dil-res-pills';
        const links = add(card, 'div');
        links.className = 'gpt-dil-res-links';
        let hasTimes = false;
        if (Array.isArray(reservations)) {
          for (const item of reservations.slice(0, 50)) {
            const availability = item.availability_data || {};
            const times = Array.isArray(availability.times) ? availability.times : [];
            for (const time of times.slice(0, 200)) {
              hasTimes = true;
              add(pills, 'span', [time, availability.party_size, ...(availability.table_types_by_time?.[time] || [])].filter(value => value != null).join(' · '));
            }
            if (item.date || item.time) {
              hasTimes = true;
              add(pills, 'span', [item.date, item.time, item.party_size].filter(value => value != null).join(' · '));
            }
            link(links, item.provider_name || item.provider || t('订位入口'), item.provider_reservation_url || item.url || item.booking_url);
          }
        }
        if (!hasTimes) missing(card, name, 'date / time / party size');
        link(links, t('餐厅网站'), entity?.website_url || entity?.url);
        continue;
      }
      if (name === 'icon') {
        const icon = add(parent, 'span', ({ check: '✓', calendar: '▦', clock: '◷', info: 'ⓘ', star: '★', 'map-pin': '●', 'arrow-down': '↓' })[attrs.name] || '●');
        styles(icon, attrs, name);
        continue;
      }
      if (name === 'radio-group') {
        const fieldset = add(parent, 'fieldset');
        styles(fieldset, attrs, name);
        const group = { value: attrs.value, event: component.events?.onChange, component, id: key + ':group:' + groupIndex++ };
        render(component.children, fieldset, group);
        continue;
      }
      if (name === 'radio') {
        const wrapper = add(parent, 'label');
        const input = add(wrapper, 'input');
        wrapper.className = 'gpt-dil-choice';
        input.type = 'radio';
        input.name = radioGroup?.id || key;
        input.setAttribute('value', String(attrs.value ?? ''));
        if (radioGroup?.value === attrs.value) input.setAttribute('checked', '');
        if (radioGroup?.event) bind(input, radioGroup.event, radioGroup.component, 'radio');
        else input.disabled = true;
        render(component.children, wrapper);
        continue;
      }
      if (name === 'checkbox' || name === 'input') {
        const wrapper = add(parent, 'label');
        const input = add(wrapper, 'input');
        wrapper.className = 'gpt-dil-choice';
        input.type = name === 'checkbox' ? 'checkbox' : 'text';
        if (name === 'checkbox') {
          if (attrs.checked) input.setAttribute('checked', '');
        } else {
          input.setAttribute('value', String(attrs.value ?? ''));
        }
        if (attrs.placeholder) input.placeholder = attrs.placeholder;
        if (component.events?.onChange) bind(input, component.events.onChange, component, name);
        else input.disabled = true;
        render(component.children, wrapper);
        continue;
      }
      if (name === 'button') {
        const button = add(parent, 'button');
        button.type = 'button';
        styles(button, attrs, name);
        render(component.children, button);
        if (component.events?.onClick) bind(button, component.events.onClick, component, 'button');
        else {
          button.disabled = true;
          button.title = t('历史记录中不可执行');
        }
        continue;
      }

      const tagName = name === 'list' && attrs.marker === 'number'
        ? 'ol'
        : ({ mark: 'mark', title: 'h4', caption: 'small', divider: 'hr', list: 'ul', 'list-item': 'li', text: 'span', label: 'span', badge: 'span', row: 'div', box: 'section', grid: 'div', 'grid-item': 'div' })[name] || 'div';
      const element = add(parent, tagName);
      styles(element, attrs, name);
      if (name === 'list' && attrs.connector === 'solid') element.style.borderLeft = '1px solid var(--border)';
      render(component.children, element, radioGroup);
    }
  }

  const hasInteractiveState = program.declarations.some(item => item.setter);
  if (hasInteractiveState) {
    const toolbar = add(host, 'div');
    toolbar.className = 'gpt-dil-toolbar';
    const reset = add(toolbar, 'button', t('重置为导出状态'));
    reset.type = 'button';
    reset.className = 'gpt-btn';
    reset.dataset.gptDilReset = '';
  }

  render(materialized.nodes, host);
  if (materialized.diagnostics.length) {
    const details = add(host, 'details');
    details.className = 'gpt-card-details';
    add(details, 'summary', t('组件解析提示') + ' (' + materialized.diagnostics.length + ')');
    for (const item of materialized.diagnostics.slice(0, 50)) add(details, 'p', item.code + ': ' + item.detail);
  }
  const entry = gptDilPrograms.get(key);
  if (entry) entry.events = events;
  return host;
}

function gptDilRefresh(host, entry) {
  const key = host.dataset.gptProgram;
  gptComponentState(key).values = entry.state;
  host.replaceWith(buildGptProgram(key, entry.program, entry.state));
}

function handleGptDilEvent(event) {
  const target = event.target.closest('[data-gpt-dil-event]');
  if (!target) return;
  const host = target.closest('[data-gpt-program]');
  const entry = gptDilPrograms.get(host?.dataset.gptProgram);
  if (!entry) return;
  const kind = target.dataset.gptDilKind;
  if ((kind === 'button') !== (event.type === 'click')) return;
  if (kind === 'radio' && !target.checked) return;
  const descriptor = entry.events?.[Number(target.dataset.gptDilEvent)];
  if (!descriptor) return;
  try {
    const result = gptDilCore().action(
      entry.program,
      descriptor.event,
      descriptor.locals,
      kind === 'checkbox' ? target.checked : target.value,
      entry.state
    );
    if (result.state) {
      entry.state = result.state;
      delete entry.state._generatedMessage;
      gptDilRefresh(host, entry);
    }
    if (result.message !== undefined) {
      entry.state._generatedMessage = result.message;
      gptComponentState(host.dataset.gptProgram).values = entry.state;
      host.querySelector('.gpt-dil-output')?.remove();
      const output = document.createElement('section');
      output.className = 'gpt-dil-output';
      const title = document.createElement('p');
      title.textContent = t('本地生成的消息，未发送');
      const text = document.createElement('textarea');
      text.readOnly = true;
      text.value = result.message;
      text.rows = 5;
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'gpt-btn';
      copy.textContent = t('复制消息');
      copy.addEventListener('click', async () => {
        text.select();
        try {
          await navigator.clipboard.writeText(text.value);
          copy.textContent = t('已复制');
        } catch {
          text.focus();
          text.select();
        }
      });
      output.append(title, text, copy);
      host.append(output);
    }
  } catch (error) {
    target.title = t('该动作无法在历史记录中执行：') + error.message;
  }
}

document.addEventListener('change', handleGptDilEvent);
document.addEventListener('click', event => {
  const choiceBtn = event.target.closest('[data-remote-choice]');
  if (choiceBtn) {
    setGptRemoteResources(choiceBtn.dataset.remoteChoice === 'on');
    return;
  }
  const headerToggle = event.target.closest('#remote-resources-btn');
  if (headerToggle) {
    setGptRemoteResources(!gptRemoteResources);
    return;
  }
  const reset = event.target.closest('[data-gpt-dil-reset]');
  if (reset) {
    const host = reset.closest('[data-gpt-program]');
    const entry = gptDilPrograms.get(host.dataset.gptProgram);
    if (entry) {
      entry.state = structuredClone(entry.program.initial);
      gptDilRefresh(host, entry);
    }
    return;
  }
  handleGptDilEvent(event);
});

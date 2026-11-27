function gptComponentStatesInit() {
  return new Map();
}
const gptComponentStates = gptComponentStatesInit();
let gptComponentGeneration = -1;

function gptComponentState(key) {
  if (gptComponentGeneration !== dataWorkerGeneration) {
    gptComponentStates.clear();
    gptDilPrograms.clear();
    gptComponentGeneration = dataWorkerGeneration;
  }
  const state = gptComponentStates.get(key) || { index: 0 };
  gptComponentStates.delete(key);
  gptComponentStates.set(key, state);
  while (gptComponentStates.size > 32) {
    gptComponentStates.delete(gptComponentStates.keys().next().value);
  }
  return state;
}

let activePlatformFilter = '';
document.getElementById('platform-filter')?.addEventListener('click', event => {
  const button = event.target.closest('[data-platform]');
  if (!button) return;
  activePlatformFilter = button.dataset.platform || '';
  document.querySelectorAll('#platform-filter [data-platform]').forEach(el => {
    const active = (el.dataset.platform || '') === activePlatformFilter;
    el.classList.toggle('active', active);
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const query = document.getElementById('search-box')?.value || '';
  if (query.trim() && typeof filterConvs === 'function') filterConvs(query);
  else renderConvList(getSortedConvs());
});

function gptViewTitle(view) {
  if (view.kind === 'images') return t('图片组');
  if (view.kind === 'map') return t('地点');
  if (view.kind === 'disabled') return t('历史组件');
  if (view.kind === 'missing') return t('来源数据缺失');
  if (view.kind === 'unknown') {
    return view.title && !view.title.includes(' / ') ? view.title : t('未知组件');
  }
  return view.title || t('组件');
}

function renderGptViews(block, location = '') {
  if (!Array.isArray(block.gptViews) || !block.gptViews.length) return '';
  const host = document.createElement('div');
  host.className = 'gpt-components';
  const add = (parent, tag, text) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    parent.append(element);
    return element;
  };
  const remoteAllowed = gptRemoteResources && !block._redactedMedia && !gptStrictImgPolicy();

  for (const [position, view] of block.gptViews.slice(0, 256).entries()) {
    const card = add(host, 'section');
    card.className = 'gpt-card';
    const header = add(card, 'div');
    header.className = 'gpt-card-head';
    add(header, 'strong', gptViewTitle(view));
    if (view.kind === 'disabled') {
      const badge = add(header, 'span', t('历史记录中不可执行'));
      badge.className = 'gpt-card-badge';
    }
    if (view.description) {
      const desc = add(card, 'p', view.description);
      desc.className = 'gpt-card-desc';
    }

    if (view.kind === 'images') {
      const images = view.images || [];
      if (remoteAllowed) {
        const grid = add(card, 'div');
        grid.className = 'gpt-image-grid';
        for (const item of images.slice(0, 100)) {
          const url = gptExportCore().safeUrl(item.url);
          if (!url) continue;
          const img = add(grid, 'img');
          img.src = url;
          img.alt = item.title || '';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
        }
      } else if (images.length) {
        const gallery = add(card, 'div');
        gallery.className = 'gpt-gallery';
        const key = JSON.stringify([dataWorkerGeneration, currentConv?.uuid, location, position]);
        const state = gptComponentState(key);
        gallery.dataset.gptGallery = key;
        for (const [index, image] of images.entries()) {
          const row = add(gallery, 'div');
          row.className = 'gpt-gallery-row';
          row.hidden = index !== state.index;
          const label = add(row, 'span', t('远程图片未加载：') + (image.title || t('图片')));
          label.className = 'gpt-card-muted';
          const url = gptExportCore().safeUrl(image.url);
          if (url) {
            const anchor = add(row, 'a', t('打开链接'));
            anchor.className = 'gpt-inline-link';
            anchor.href = url;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.referrerPolicy = 'no-referrer';
          }
        }
        if (images.length > 1) {
          const nav = add(gallery, 'div');
          nav.className = 'gpt-gallery-nav';
          for (const [direction, label] of [[-1, t('上一张')], [1, t('下一张')]]) {
            const button = add(nav, 'button', label);
            button.type = 'button';
            button.className = 'gpt-btn';
            button.dataset.gptGalleryStep = String(direction);
          }
        }
      }
    }

    if (view.url) {
      const url = gptExportCore().safeUrl(view.url);
      if (url) {
        const anchor = add(card, 'a', t('外部链接'));
        anchor.className = 'gpt-inline-link';
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.referrerPolicy = 'no-referrer';
      }
    }

    if (view.kind === 'map') {
      const points = (view.points || []).filter(
        point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
      );
      if (points.length) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 480 180');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', t('坐标分布图'));
        svg.classList.add('gpt-coord-plot');
        for (const y of [45, 90, 135]) {
          const line = document.createElementNS(svg.namespaceURI, 'line');
          line.setAttribute('x1', '0');
          line.setAttribute('x2', '480');
          line.setAttribute('y1', String(y));
          line.setAttribute('y2', String(y));
          line.setAttribute('stroke', 'var(--border)');
          line.setAttribute('stroke-dasharray', '3 3');
          svg.append(line);
        }
        const latitudes = points.map(point => point.latitude);
        const longitudes = points.map(point => point.longitude);
        const minLat = Math.min(...latitudes);
        const maxLat = Math.max(...latitudes);
        const minLon = Math.min(...longitudes);
        const maxLon = Math.max(...longitudes);
        for (const [index, point] of points.entries()) {
          const cx = 36 + 408 * (point.longitude - minLon) / (maxLon - minLon || 1);
          const cy = 152 - 124 * (point.latitude - minLat) / (maxLat - minLat || 1);
          const circle = document.createElementNS(svg.namespaceURI, 'circle');
          circle.setAttribute('cx', String(cx));
          circle.setAttribute('cy', String(cy));
          circle.setAttribute('r', '10');
          circle.setAttribute('fill', 'var(--accent)');
          const title = document.createElementNS(svg.namespaceURI, 'title');
          title.textContent = (index + 1) + '. ' + point.title;
          circle.append(title);
          svg.append(circle);

          const num = document.createElementNS(svg.namespaceURI, 'text');
          num.setAttribute('x', String(cx));
          num.setAttribute('y', String(cy + 4));
          num.setAttribute('text-anchor', 'middle');
          num.setAttribute('fill', '#fff');
          num.setAttribute('font-size', '11');
          num.setAttribute('font-weight', '600');
          num.textContent = String(index + 1);
          svg.append(num);

          if (point.title) {
            const flip = cx > 340;
            const label = document.createElementNS(svg.namespaceURI, 'text');
            label.setAttribute('x', String(flip ? cx - 14 : cx + 14));
            label.setAttribute('y', String(cy + 4));
            if (flip) label.setAttribute('text-anchor', 'end');
            label.setAttribute('fill', 'currentColor');
            label.setAttribute('font-size', '11');
            label.textContent = point.title.slice(0, 24);
            svg.append(label);
          }
        }
        card.append(svg);
      }
    }

    if (view.kind === 'disabled' && (view.buttons || []).length) {
      const btnRow = add(card, 'div');
      btnRow.className = 'gpt-card-actions';
      for (const label of view.buttons) {
        const button = add(btnRow, 'button', label);
        button.type = 'button';
        button.className = 'gpt-btn';
        button.disabled = true;
      }
    }

    if (view.kind === 'file') {
      const resource = findGptResource(view.fileId);
      if (resource) {
        const button = add(card, 'button', t('本地附件'));
        button.type = 'button';
        button.className = 'gpt-btn';
        button.dataset.gptResource = resource.path;
      } else {
        const note = add(card, 'p', t('附件未包含在导出中'));
        note.className = 'gpt-card-muted';
      }
    }

    if (view.details) {
      const details = add(card, 'details');
      details.className = 'gpt-card-details';
      add(details, 'summary', t('查看导出信息'));
      add(details, 'pre', view.details);
    }
  }
  return host.outerHTML;
}

function findGptResource(fileId) {
  if (!fileId) return null;
  return (exportSession.resources || []).find(
    resource => resource.packageId === currentConv?._sourcePackage && (resource.fileId === fileId || resource.altId === fileId || resource.path === fileId)
  );
}

document.addEventListener('click', async event => {
  const galleryButton = event.target.closest('[data-gpt-gallery-step]');
  if (galleryButton) {
    const gallery = galleryButton.closest('[data-gpt-gallery]');
    const rows = [...gallery.querySelectorAll('.gpt-gallery-row')];
    const current = rows.findIndex(row => !row.hidden);
    const next = (current + Number(galleryButton.dataset.gptGalleryStep) + rows.length) % rows.length;
    gptComponentState(gallery.dataset.gptGallery).index = next;
    rows.forEach((row, index) => { row.hidden = index !== next; });
    return;
  }
  const button = event.target.closest('[data-gpt-resource]');
  if (!button) return;
  const resource = findGptResource(button.dataset.gptResource);
  const generation = dataWorkerGeneration;
  const uuid = currentConv?.uuid;
  if (!resource) return;
  button.disabled = true;
  try {
    const { blob } = await featureRequest('import', 'resource', resource);
    if (generation !== dataWorkerGeneration || uuid !== currentConv?.uuid || !button.isConnected) return;
    if (resource.mime === 'text/markdown' || resource.mime === 'text/plain') {
      const preview = document.createElement('details');
      preview.className = 'gpt-card-details';
      const summary = document.createElement('summary');
      summary.textContent = resource.name;
      const body = document.createElement('pre');
      body.textContent = await blob.slice(0, 1024 * 1024).text();
      if (generation !== dataWorkerGeneration || uuid !== currentConv?.uuid || !button.isConnected) return;
      preview.append(summary, body);
      preview.open = true;
      button.after(preview);
    }
    downloadBlob(blob, resource.name);
  } catch (error) {
    if (error.name !== 'AbortError') button.title = error.message;
  } finally {
    button.disabled = false;
  }
});

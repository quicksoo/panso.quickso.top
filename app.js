// In production, serve the UI and this path from the same domain through Nginx.
const API_BASE = window.QUICK_PAN_API_BASE || 'http://localhost:8888';
const platformNames = {
  baidu: '百度网盘', aliyun: '阿里云盘', quark: '夸克网盘', guangya: '光鸭云盘',
  tianyi: '天翼云盘', uc: 'UC 网盘', mobile: '移动云盘', '115': '115 网盘',
  pikpak: 'PikPak', xunlei: '迅雷网盘', '123': '123 网盘', magnet: '磁力链接',
  ed2k: '电驴链接', others: '其他链接'
};

const $ = (selector) => document.querySelector(selector);
const list = $('#resultList');
const detailDialog = $('#detailDialog');
const state = {
  query: '', items: [], selected: null, loading: false,
  platforms: new Set(), cloudTypes: new Set(),
  history: JSON.parse(localStorage.getItem('quick-pan-history') || '[]')
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function apiUrl(path) { return `${API_BASE}/api${path}`; }
function sourceKind(source) { return source?.startsWith('tg:') ? 'Telegram' : source?.startsWith('plugin:') ? '插件' : '其他来源'; }

function mapResults(payload) {
  const merged = payload?.data?.merged_by_type || payload?.merged_by_type || {};
  return Object.entries(merged).flatMap(([platform, links]) => (Array.isArray(links) ? links : []).map((link, index) => {
    const url = String(link.url || '');
    return {
      id: `${platform}:${url || index}:${link.password || ''}`, platform, platformName: platformNames[platform] || platform, url,
      password: String(link.password || ''), title: String(link.note || link.work_title || `${platformNames[platform] || platform} 资源`),
      source: String(link.source || 'unknown'), sourceLabel: sourceKind(link.source), date: String(link.datetime || '').slice(0, 10),
      image: Array.isArray(link.images) && /^https:\/\//.test(link.images[0] || '') ? link.images[0] : ''
    };
  }));
}

function renderHistory() {
  $('#recentSearches').hidden = state.history.length === 0;
  $('#historyList').innerHTML = state.history.map((term) => `<button type="button" data-history="${escapeHtml(term)}">${escapeHtml(term)}</button>`).join('');
}

function addHistory(term) {
  state.history = [term, ...state.history.filter((item) => item !== term)].slice(0, 5);
  localStorage.setItem('quick-pan-history', JSON.stringify(state.history));
  renderHistory();
}

function updateCloudTypeLabel() {
  const selected = [...state.cloudTypes];
  $('#cloudTypeLabel').textContent = selected.length === 0 ? '全部网盘' : selected.length === 1 ? (platformNames[selected[0]] || selected[0]) : `已选 ${selected.length} 个网盘`;
}

function filteredItems() {
  return state.items.filter((item) => {
    const matchingPlatform = !state.platforms.size || state.platforms.has(item.platform);
    return matchingPlatform;
  });
}

function resourceCard(item) {
  const encodedId = encodeURIComponent(item.id);
  const password = item.password ? `<span>提取码 ${escapeHtml(item.password)}</span>` : '';
  return `<article class="result-card">
    <div class="card-copy">
      <h3 class="card-title">${escapeHtml(item.title)}</h3>
      <div class="result-meta"><span class="source-badge">${escapeHtml(item.platform.slice(0, 3).toUpperCase())}</span><span>${escapeHtml(item.platformName)}</span>${password}<button type="button" class="detail-link" data-action="detail" data-id="${encodedId}">查看详情</button></div>
    </div>
    <button class="result-action" type="button" data-action="detail" data-id="${encodedId}">获取资源</button>
  </article>`;
}

function renderFilters() {
  const platforms = [...new Set(state.items.map((item) => item.platform))];
  const allActive = state.platforms.size === 0 || state.platforms.size === platforms.length;
  const all = `<button type="button" class="platform-filter ${allActive ? 'active' : ''}" data-platform="all"><span>全部</span><strong>${state.items.length}</strong></button>`;
  const items = platforms.map((platform) => `<button type="button" class="platform-filter ${state.platforms.has(platform) && !allActive ? 'active' : ''}" data-platform="${escapeHtml(platform)}"><span class="platform-mark">${escapeHtml(platform.slice(0, 2).toUpperCase())}</span><span>${escapeHtml(platformNames[platform] || platform)}</span><strong>${state.items.filter((item) => item.platform === platform).length}</strong></button>`).join('');
  $('#platformFilters').innerHTML = platforms.length ? all + items : '<p class="filter-placeholder">搜索后显示</p>';
}

function render() {
  const items = filteredItems();
  list.innerHTML = items.map(resourceCard).join('');
  $('#emptyState').hidden = !(state.query && !state.loading && items.length === 0);
  $('#resultTitle').textContent = state.query ? `“${state.query}”的结果` : '等待检索';
  $('#resultSummary').textContent = state.loading ? '正在检索，请稍候...' : state.query ? `已找到 ${items.length} 条结果` : '输入关键词，开始检索。';
  renderFilters();
  renderHistory();
}

let toastTimer;
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2400);
}

function findItem(id) { return state.items.find((item) => item.id === id); }

function showDetail(id) {
  const item = findItem(id);
  if (!item) return;
  state.selected = item;
  $('#dialogSource').textContent = `${item.sourceLabel.toUpperCase()} · ${item.platformName}`;
  $('#dialogTitle').textContent = item.title;
  $('#dialogDescription').textContent = `来自 ${item.source} 的检索结果。打开前请自行确认资源内容与分享链接状态。`;
  $('#dialogMeta').innerHTML = `<dt>网盘类型</dt><dd>${escapeHtml(item.platformName)}</dd><dt>收录来源</dt><dd>${escapeHtml(item.source)}</dd><dt>最后整理</dt><dd>${escapeHtml(item.date || '未知')}</dd><dt>提取码</dt><dd>${escapeHtml(item.password || '无')}</dd>`;
  $('#dialogLink').href = item.url || '#';
  $('#linkStatus').textContent = '';
  detailDialog.showModal();
}

async function performSearch() {
  const keyword = $('#query').value.trim();
  if (!keyword) { toast('请输入搜索关键词'); return; }
  state.query = keyword;
  state.loading = true;
  render();
  try {
    const request = { kw: keyword, res: 'merge' };
    if (state.cloudTypes.size) request.cloud_types = [...state.cloudTypes];
    const response = await fetch(apiUrl('/search'), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(request) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `搜索服务返回 HTTP ${response.status}`);
    state.items = mapResults(payload);
    state.platforms = new Set(state.items.map((item) => item.platform));
    addHistory(keyword);
    toast(`已接收 ${state.items.length} 条结果`);
  } catch (error) {
    state.items = [];
    toast(error instanceof TypeError ? '无法连接搜索服务，请稍后重试。' : error.message);
  } finally {
    state.loading = false;
    render();
    document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function copySelectedLink() {
  const item = state.selected;
  const text = item.password ? `${item.url}\n提取码：${item.password}` : item.url;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const input = document.createElement('textarea');
    input.value = text; document.body.append(input); input.select(); document.execCommand('copy'); input.remove();
  }
  toast('链接已复制');
}

async function checkSelectedLink(event) {
  const item = state.selected;
  const button = event.currentTarget;
  button.disabled = true; button.textContent = '检测中'; $('#linkStatus').textContent = '';
  try {
    const response = await fetch(apiUrl('/check/links'), { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ items: [{ disk_type: item.platform, url: item.url, password: item.password }] }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `检测失败（HTTP ${response.status}）`);
    const result = payload?.data?.results?.[0] || payload?.results?.[0];
    const labels = { ok: '链接有效', bad: '链接失效', locked: '需要提取码或密码不正确', unsupported: '该类型暂不支持检测', uncertain: '暂时无法确认链接状态' };
    $('#linkStatus').textContent = labels[result?.state] || result?.summary || '未获得检测结果';
  } catch (error) {
    $('#linkStatus').textContent = error.message || '检测失败，请稍后重试。';
  } finally {
    button.disabled = false; button.textContent = '检测链接';
  }
}

$('#searchForm').addEventListener('submit', (event) => { event.preventDefault(); performSearch(); });
document.querySelectorAll('[data-query]').forEach((button) => button.addEventListener('click', () => { $('#query').value = button.dataset.query; performSearch(); }));
$('#cloudTypeOptions').addEventListener('change', (event) => {
  const input = event.target;
  if (!input.matches('input[type="checkbox"]')) return;
  input.checked ? state.cloudTypes.add(input.value) : state.cloudTypes.delete(input.value);
  updateCloudTypeLabel();
});
document.addEventListener('click', (event) => {
  const picker = $('#cloudTypePicker');
  if (picker.open && !picker.contains(event.target)) picker.removeAttribute('open');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $('#cloudTypePicker').removeAttribute('open');
});
$('#historyList').addEventListener('click', (event) => { const button = event.target.closest('[data-history]'); if (button) { $('#query').value = button.dataset.history; performSearch(); } });
$('#clearHistory').addEventListener('click', () => { state.history = []; localStorage.removeItem('quick-pan-history'); renderHistory(); });
$('.filters').addEventListener('click', (event) => {
  const button = event.target.closest('[data-platform]');
  if (!button) return;
  const platform = button.dataset.platform;
  state.platforms = platform === 'all' ? new Set() : new Set([platform]);
  render();
});
list.addEventListener('click', (event) => { const button = event.target.closest('[data-action="detail"]'); if (button) showDetail(decodeURIComponent(button.dataset.id)); });
$('#closeDialog').addEventListener('click', () => detailDialog.close());
$('#dialogCopy').addEventListener('click', copySelectedLink);
$('#dialogCheck').addEventListener('click', checkSelectedLink);
$('#themeButton').addEventListener('click', () => { document.body.classList.toggle('dark'); $('#themeButton').innerHTML = document.body.classList.contains('dark') ? '&#9728;' : '&#9790;'; });

render();
updateCloudTypeLabel();

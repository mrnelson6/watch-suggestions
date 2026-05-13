import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cfg = window.APP_CONFIG;
const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const TMDB_IMG = 'https://image.tmdb.org/t/p/w200';

const $ = (id) => document.getElementById(id);
const els = {
  search: $('search'),
  results: $('results'),
  picked: $('picked'),
  pickedPoster: $('picked-poster'),
  pickedTitle: $('picked-title'),
  pickedYear: $('picked-year'),
  pickedOverview: $('picked-overview'),
  pickedClear: $('picked-clear'),
  name: $('name'),
  submit: $('submit'),
  msg: $('submit-msg'),
  list: $('suggestions'),
  empty: $('empty'),
  sortBtns: document.querySelectorAll('.sort-btn'),
};

const FP_KEY = 'ws_fingerprint';
function fingerprint() {
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}
const FP = fingerprint();

let pickedItem = null;
let sortMode = 'votes';

function setMsg(text, kind) {
  els.msg.textContent = text || '';
  els.msg.hidden = !text;
  els.msg.className = 'msg' + (kind ? ' ' + kind : '');
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function tmdbSearch(query) {
  if (!query.trim()) return [];
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${cfg.TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB search failed');
  const data = await res.json();
  return (data.results || [])
    .filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 8);
}

function renderResults(items) {
  if (!items.length) {
    els.results.hidden = true;
    els.results.innerHTML = '';
    return;
  }
  els.results.innerHTML = items.map((r, i) => {
    const title = r.title || r.name || 'Untitled';
    const date = r.release_date || r.first_air_date || '';
    const year = date ? date.slice(0, 4) : '';
    const kind = r.media_type === 'tv' ? 'TV' : 'Movie';
    const poster = r.poster_path ? `<img src="${TMDB_IMG}${r.poster_path}" alt="">` : `<img alt="">`;
    return `<li data-i="${i}">
      ${poster}
      <div class="r-meta">
        <span class="r-title">${escapeHtml(title)}</span>
        <span class="r-sub">${kind}${year ? ' · ' + year : ''}</span>
      </div>
    </li>`;
  }).join('');
  els.results.hidden = false;
  Array.from(els.results.children).forEach((li, i) => {
    li.addEventListener('click', () => pickItem(items[i]));
  });
}

function pickItem(r) {
  const title = r.title || r.name || 'Untitled';
  const date = r.release_date || r.first_air_date || '';
  const year = date ? date.slice(0, 4) : '';
  pickedItem = {
    tmdb_id: r.id,
    media_type: r.media_type,
    title,
    year,
    poster_path: r.poster_path || null,
    overview: r.overview || '',
  };
  els.pickedPoster.src = r.poster_path ? `${TMDB_IMG}${r.poster_path}` : '';
  els.pickedTitle.textContent = title;
  els.pickedYear.textContent = (r.media_type === 'tv' ? 'TV' : 'Movie') + (year ? ' · ' + year : '');
  els.pickedOverview.textContent = r.overview || '';
  els.picked.hidden = false;
  els.search.value = '';
  els.results.hidden = true;
  els.results.innerHTML = '';
  els.submit.disabled = false;
  setMsg('');
}

function clearPick() {
  pickedItem = null;
  els.picked.hidden = true;
  els.submit.disabled = true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const onSearch = debounce(async () => {
  const q = els.search.value;
  if (!q.trim()) {
    els.results.hidden = true;
    return;
  }
  try {
    const items = await tmdbSearch(q);
    renderResults(items);
  } catch (e) {
    console.error(e);
  }
}, 250);

els.search.addEventListener('input', onSearch);
els.pickedClear.addEventListener('click', clearPick);

document.addEventListener('click', (e) => {
  if (!els.results.contains(e.target) && e.target !== els.search) {
    els.results.hidden = true;
  }
});

async function loadSuggestions() {
  const { data, error } = await supabase
    .from('suggestions_with_votes')
    .select('*');
  if (error) {
    console.error(error);
    return;
  }
  const myVotes = await loadMyVotes();
  const sorted = [...data].sort((a, b) => {
    if (sortMode === 'votes') {
      if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
      return new Date(b.created_at) - new Date(a.created_at);
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });
  renderList(sorted, myVotes);
}

async function loadMyVotes() {
  const { data, error } = await supabase
    .from('votes')
    .select('suggestion_id')
    .eq('voter_fingerprint', FP);
  if (error) {
    console.error(error);
    return new Set();
  }
  return new Set(data.map((v) => v.suggestion_id));
}

function renderList(items, myVotes) {
  els.empty.hidden = items.length > 0;
  els.list.innerHTML = items.map((s) => {
    const poster = s.poster_path ? `<img src="${TMDB_IMG}${s.poster_path}" alt="">` : `<img alt="">`;
    const kind = s.media_type === 'tv' ? 'TV' : 'Movie';
    const voted = myVotes.has(s.id);
    const by = s.suggester_name ? `Suggested by ${escapeHtml(s.suggester_name)}` : 'Suggested anonymously';
    return `<li class="s-item" data-id="${s.id}">
      ${poster}
      <div class="s-meta">
        <div class="s-title">${escapeHtml(s.title)}</div>
        <div class="s-sub">${kind}${s.year ? ' · ' + s.year : ''}</div>
        <div class="s-by">${by}</div>
      </div>
      <div class="s-vote">
        <button type="button" class="vote-btn ${voted ? 'voted' : ''}" data-id="${s.id}" aria-label="Upvote">▲</button>
        <span class="count">${s.vote_count}</span>
      </div>
    </li>`;
  }).join('');
  els.list.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleVote(btn.dataset.id, btn));
  });
}

async function toggleVote(suggestionId, btn) {
  const isVoted = btn.classList.contains('voted');
  btn.disabled = true;
  if (isVoted) {
    const { error } = await supabase
      .from('votes')
      .delete()
      .eq('suggestion_id', suggestionId)
      .eq('voter_fingerprint', FP);
    if (error) console.error(error);
  } else {
    const { error } = await supabase
      .from('votes')
      .insert({ suggestion_id: suggestionId, voter_fingerprint: FP });
    if (error && error.code !== '23505') console.error(error);
  }
  btn.disabled = false;
  await loadSuggestions();
}

els.submit.addEventListener('click', async () => {
  if (!pickedItem) return;
  els.submit.disabled = true;
  setMsg('Submitting…');
  const name = els.name.value.trim() || null;
  const payload = { ...pickedItem, suggester_name: name };

  const { data, error } = await supabase
    .from('suggestions')
    .insert(payload)
    .select()
    .single();

  let suggestionId = data?.id;
  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('suggestions')
        .select('id')
        .eq('tmdb_id', pickedItem.tmdb_id)
        .eq('media_type', pickedItem.media_type)
        .single();
      suggestionId = existing?.id;
      setMsg('Already suggested — upvoted for you.', 'ok');
    } else {
      console.error(error);
      setMsg('Could not submit. Try again.', 'err');
      els.submit.disabled = false;
      return;
    }
  } else {
    setMsg('Thanks — suggestion added.', 'ok');
  }

  if (suggestionId) {
    await supabase
      .from('votes')
      .insert({ suggestion_id: suggestionId, voter_fingerprint: FP });
  }

  clearPick();
  els.name.value = '';
  await loadSuggestions();
});

els.sortBtns.forEach((b) => {
  b.addEventListener('click', () => {
    els.sortBtns.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    sortMode = b.dataset.sort;
    loadSuggestions();
  });
});

supabase
  .channel('suggestions-live')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions' }, loadSuggestions)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, loadSuggestions)
  .subscribe();

loadSuggestions();

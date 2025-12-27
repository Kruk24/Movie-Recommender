// /static/home.js
async function fetchUserFavoritesIds() {
    if (!loggedIn) return [];
    try {
        const res = await fetch("/user/favorites.json", { credentials: "same-origin" });
        if (!res.ok) return [];
        const j = await res.json();
        return j.favorites.map(f => f.id);
    } catch (err) {
        console.error("fetchUserFavoritesIds error", err);
        return [];
    }
}

function createMovieCard(f, isFav) {
    const posterUrl = f.poster_path ? `https://image.tmdb.org/t/p/w200${f.poster_path}` : (f.poster || "https://via.placeholder.com/150");
    const div = document.createElement("div");
    div.classList.add("movie");

    // przycisk zawsze w DOM, zachowanie zależne od loggedIn
    const btnText = isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych";
    const btnAttr = f.id ? `data-movie-id="${f.id}"` : "";

    div.innerHTML = `
        <h2>${f.title || f.name}</h2>
        <img src="${posterUrl}" alt="${f.title || f.name}" width="150">
        <p>Ocena: ${f.vote_average ?? (f.rating ?? "—")}</p>
        <button class="favorite-btn" ${btnAttr}>${btnText}</button>
    `;
    return div;
}

async function renderMovies(movies) {
    const container = document.getElementById("movies-container");
    container.innerHTML = "";

    const favIds = await fetchUserFavoritesIds();

    movies.forEach(f => {
        if (!f || (!f.id && !f.title && !f.name)) return;
        const isFav = favIds.includes(f.id);
        const card = createMovieCard(f, isFav);
        container.appendChild(card);
    });

    // dodajemy listenery
    document.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const movieId = btn.dataset.movieId;
            if (!movieId) {
                // nie ma id → nic nie robimy
                return;
            }
            if (!loggedIn) {
                window.location.href = "/auth/login";
                return;
            }
            try {
                const res = await fetch(`/user/favorite/${movieId}`, {
                    method: "POST",
                    credentials: "same-origin"
                });
                if (!res.ok) {
                    console.error("toggle favorite failed", await res.text());
                    return;
                }
                const data = await res.json();
                if (data.removed) btn.textContent = "Dodaj do ulubionych";
                else btn.textContent = "Usuń z ulubionych";
            } catch (err) {
                console.error("toggle favorite error", err);
            }
        });
    });
}

// Debounce helper
function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function setupGlobalSearch() {
  const input = document.getElementById('global-search');
  const list = document.getElementById('search-suggestions');
  if (!input || !list) return;

  async function doSearch(q) {
    if (!q || q.trim().length < 1) {
      list.classList.remove('visible');
      list.innerHTML = '';
      return;
    }
    try {
      const res = await fetch(`/movies/search?q=${encodeURIComponent(q)}&limit=6`);
      if (!res.ok) throw new Error('search failed');
      const data = await res.json();
      const hits = (data && Array.isArray(data.results)) ? data.results : [];
      list.innerHTML = '';
      if (!hits.length) {
        list.classList.remove('visible');
        return;
      }
      hits.slice(0,6).forEach(item => {
        const li = document.createElement('li');
        li.textContent = item.title + (item.release_date ? ` (${(item.release_date || '').slice(0,4)})` : '');
        li.dataset.query = item.title;
        li.dataset.tmdb = item.id;
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => {
          // navigate to search results for the clicked title
          window.location.href = `/?q=${encodeURIComponent(item.title)}`;
        });
        list.appendChild(li);
      });
      list.classList.add('visible');
    } catch (err) {
      console.error(err);
      list.classList.remove('visible');
    }
  }

  const debouncedSearch = debounce(e => doSearch(e.target.value), 250);

  input.addEventListener('input', debouncedSearch);

  // on focus: if there's a query, show matching suggestions; otherwise show top popular suggestions
  input.addEventListener('focus', async () => {
    const q = input.value && input.value.trim();
    if (q) return doSearch(q);

    try {
      const res = await fetch('/movies/top/popular');
      if (!res.ok) return;
      const d = await res.json();
      const hits = d.top10 || d.results || [];
      list.innerHTML = '';
      hits.slice(0,6).forEach(item => {
        const li = document.createElement('li');
        const title = item.title || item.name;
        const year = (item.release_date || '').slice(0,4) || (item.first_air_date || '').slice(0,4) || '';
        li.textContent = title + (year ? ` (${year})` : '');
        li.dataset.query = title;
        li.dataset.tmdb = item.id;
        li.setAttribute('role', 'option');
        li.addEventListener('click', () => window.location.href = `/?q=${encodeURIComponent(title)}`);
        list.appendChild(li);
      });
      if (hits.length) list.classList.add('visible');
    } catch (err) {
      // ignore
    }
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      // perform an inline full search and render up to 20 popular matches
      try {
        const res = await fetch(`/movies/search?q=${encodeURIComponent(q)}&limit=20`);
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        const hits = (data && Array.isArray(data.results)) ? data.results : [];
        const container = document.getElementById('movies-container');
        if (container) {
          container.innerHTML = `<h2>Wyniki wyszukiwania dla "${escapeHtml(q)}" (${hits.length})</h2>`;
          if (hits.length === 0) container.insertAdjacentHTML('beforeend', '<p>Brak wyników.</p>');
          else await renderMovies(hits);
        }
      } catch (err) {
        console.error('search query failed', err);
      } finally {
        list.classList.remove('visible');
      }
    } else if (e.key === 'Escape') {
      list.classList.remove('visible');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => list.classList.remove('visible'), 150);
  });
}

// eventy UI
document.addEventListener("DOMContentLoaded", () => {
  // initialize global search behaviors
  setupGlobalSearch();
    document.getElementById("favorites-btn").addEventListener("click", () => window.location.href = "/user/favorites");
    document.getElementById("popular-btn").addEventListener("click", async () => {
        const res = await fetch("/movies/top/popular");
        const d = await res.json();
        await renderMovies(d.top10 || d.results || []);
    });
    document.getElementById("toprated-btn").addEventListener("click", async () => {
        const res = await fetch("/movies/top/top_rated");
        const d = await res.json();
        await renderMovies(d.top10 || d.results || []);
    });

    // login/logout button visibility
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    if (loggedIn) {
        if (loginBtn) loginBtn.style.display = "none";
        if (logoutBtn) { logoutBtn.style.display = "inline-block"; logoutBtn.onclick = () => window.location.href = "/auth/logout"; }
    } else {
        if (logoutBtn) logoutBtn.style.display = "none";
        if (loginBtn) { loginBtn.style.display = "inline-block"; loginBtn.onclick = () => window.location.href = "/auth/login"; }
    }

        // If the page was loaded with a search query (?q=...), perform the search and render results
        (async function performQueryParamSearch() {
          const params = new URLSearchParams(window.location.search);
          const q = params.get('q');
          if (!q || !q.trim()) return;

          // populate the search input
          const input = document.getElementById('global-search');
          if (input) input.value = q;

          try {
            const res = await fetch(`/movies/search?q=${encodeURIComponent(q)}&limit=20`);
            if (!res.ok) throw new Error('search failed');
            const data = await res.json();
            const hits = (data && Array.isArray(data.results)) ? data.results : [];

            const container = document.getElementById('movies-container');
            if (container) {
              // heading
              container.innerHTML = `<h2>Wyniki wyszukiwania dla "${escapeHtml(q)}" (${hits.length})</h2>`;
              if (hits.length === 0) {
                container.insertAdjacentHTML('beforeend', '<p>Brak wyników.</p>');
              } else {
                await renderMovies(hits);
              }
            }
          } catch (err) {
            console.error('search query failed', err);
          }
        })();
});

      function escapeHtml(str) {
        return String(str).replace(/[&<>"'`]/g, (s) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;"})[s]);
      }
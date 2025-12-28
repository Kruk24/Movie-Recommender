console.log("--> HOME.JS ZAŁADOWANY");

async function fetchUserFavoritesIds() {
    if (!isUserLoggedIn) return [];
    try {
        const res = await fetch("/user/favorites.json", { credentials: "same-origin" });
        if (!res.ok) return []; // Cicha obsługa braku endpointu
        const j = await res.json();
        return (j.favorites || []).map(f => f.id);
    } catch (err) {
        console.warn("Brak obsługi ulubionych lub błąd sieci:", err);
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
    const release_year = (f.release_date || f.first_air_date || "").slice(0, 4) || "—";

    div.innerHTML = `
        <h2>${f.title || f.name} (${release_year})</h2>
        <img src="${posterUrl}" alt="${f.title || f.name}" width="150">
        <p>Ocena: ${f.vote_average ?? (f.rating ?? "—")}</p>
        <button class="favorite-btn" ${btnAttr}>${btnText}</button>
    `;
    return div;
}

const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

async function renderMovies(movies, targetElement) {
    if (!targetElement) return;
    
    // Czyścimy tylko wskazany element (siatkę), a nie cały kontener strony
    targetElement.innerHTML = "";

    const favIds = await fetchUserFavoritesIds();

    movies.forEach(f => {
        if (!f || (!f.id && !f.title && !f.name)) return;
        const isFav = favIds.includes(f.id);
        const card = createMovieCard(f, isFav);
        targetElement.appendChild(card);
    });

    // Listenery podpinamy do przycisków wewnątrz targetElement
    targetElement.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const movieId = btn.dataset.movieId;
            if (!movieId) return;
            
            if (!isUserLoggedIn) {
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

function prepareView(mainContainer, headingText = null) {
    mainContainer.innerHTML = ""; // Czyścimy wszystko
    
    if (headingText) {
        const h2 = document.createElement("h2");
        h2.textContent = headingText;
        mainContainer.appendChild(h2);
    }

    // Tworzymy div z klasą .movies-grid (zdefiniowaną w CSS)
    const grid = document.createElement("div");
    grid.classList.add("movies-grid");
    mainContainer.appendChild(grid);
    
    return grid;
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

  console.log("Status Search Bara:", {
      inputElement: input,
      listElement: list,
      znalezionoWszystko: !!(input && list)
  });

  if (!input || !list){
    console.warn("PRZERYWAM: Nie znaleziono inputa (#global-search) lub listy (#search-suggestions) w HTML!");
    return;
  }

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

      list.classList.remove('visible');

      try {
        const res = await fetch(`/movies/search/v2?q=${encodeURIComponent(q)}&limit=20`);
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        const hits = (data && Array.isArray(data.results)) ? data.results : [];
        
        const container = document.getElementById('movies-container');
        if (container) {
          // Tutaj używamy nowej logiki: najpierw przygotuj widok, potem renderuj
          if (hits.length === 0) {
             container.innerHTML = `<h2>Wyniki wyszukiwania dla "${escapeHtml(q)}"</h2><p>Brak wyników.</p>`;
          } else {
             // Tworzy H2 i Grid, zwraca Grid
             const grid = prepareView(container, `Wyniki wyszukiwania dla "${escapeHtml(q)}" (${hits.length})`);
             await renderMovies(hits, grid);
          }
        }
      } catch (err) {
          console.error('Search query failed', err);
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

  const container = document.getElementById("movies-container");

    document.getElementById("favorites-btn").addEventListener("click", () => window.location.href = "/user/favorites");

    document.getElementById("popular-btn").addEventListener("click", async () => {
        const res = await fetch("/movies/top/popular");
        const d = await res.json();
        const grid = prepareView(container, "Popularne filmy i seriale");
        await renderMovies(d.top10 || d.results || [], grid);
    });
    document.getElementById("toprated-btn").addEventListener("click", async () => {
        const res = await fetch("/movies/top/top_rated");
        const d = await res.json();
        const grid = prepareView(container, "Najlepiej oceniane");
        await renderMovies(d.top10 || d.results || [], grid);
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
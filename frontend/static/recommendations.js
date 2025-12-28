// /static/recommendations.js

const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", () => {
    setupAuthButtons();
    setupGlobalSearch(); // Uruchamiamy wyszukiwarkę w nagłówku
});

async function generate() {
    const btn = document.querySelector('.big-btn');
    const container = document.getElementById('results-area');
    
    btn.disabled = true;
    btn.textContent = "Myślę...";
    container.innerHTML = "<p style='text-align:center;'>Przeszukuję bazę danych i API...</p>";

    // Zbieranie danych
    const mode = window.currentMode || 'quick';
    const target = document.querySelector('input[name="target"]:checked').value;
    
    let payload = {
        mode: mode,
        target_type: target,
        use_favorites: true
    };

    if (mode === 'advanced') {
        payload.use_favorites = document.getElementById('use-fav').checked;
        
        const genreVal = document.getElementById('genre-select').value;
        const genres = genreVal ? [parseInt(genreVal)] : [];

        payload.filters = {
            genres: genres,
            year_min: parseInt(document.getElementById('year-min').value) || null,
            year_max: parseInt(document.getElementById('year-max').value) || null,
            vote_min: parseFloat(document.getElementById('vote-min').value) || null,
            
            weight_genres: parseInt(document.getElementById('w-genre').value),
            weight_years: parseInt(document.getElementById('w-year').value),
            weight_vote: parseInt(document.getElementById('w-vote').value)
        };
    }

    try {
        const res = await fetch('/recommendations/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Błąd serwera");
        
        const data = await res.json();
        await renderResults(data.results, container);

    } catch (err) {
        console.error(err);
        container.innerHTML = `<p style='color:red; text-align:center;'>Wystąpił błąd: ${err.message}</p>`;
    } finally {
        btn.disabled = false;
        btn.textContent = "Generuj Rekomendacje 🎲";
    }
}

// --- Funkcje pomocnicze UI (skopiowane z home.js/favorites.js dla spójności) ---

async function fetchUserFavoritesIds() {
    if (!isUserLoggedIn) return [];
    try {
        const res = await fetch("/user/favorites.json", { credentials: "same-origin" });
        if (!res.ok) return [];
        const j = await res.json();
        return (j.favorites || []).map(f => f.id);
    } catch (err) { return []; }
}

async function renderResults(movies, container) {
    if (!movies || movies.length === 0) {
        container.innerHTML = "<h3>Brak wyników :( Spróbuj zmienić filtry.</h3>";
        return;
    }

    // Tworzymy grid
    container.innerHTML = `<div class="movies-grid"></div>`;
    const grid = container.querySelector('.movies-grid');

    // Pobieramy ulubione, żeby poprawnie oznaczyć przyciski
    const favIds = await fetchUserFavoritesIds();

    movies.forEach(f => {
        const isFav = favIds.includes(f.id);
        const card = createMovieCard(f, isFav);
        grid.appendChild(card);
    });

    // Aktywujemy przyciski "Dodaj do ulubionych"
    grid.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const movieId = btn.dataset.movieId;
            if (!movieId) return;
            if (!isUserLoggedIn) { window.location.href = "/auth/login"; return; }
            
            const originalText = btn.textContent;
            btn.disabled = true;

            try {
                const res = await fetch(`/user/favorite/${movieId}`, { method: "POST", credentials: "same-origin" });
                if (res.ok) {
                    const data = await res.json();
                    btn.textContent = data.removed ? "Dodaj do ulubionych" : "Usuń z ulubionych";
                } else {
                    btn.textContent = originalText;
                }
            } catch (err) { console.error(err); btn.textContent = originalText; }
            finally { btn.disabled = false; }
        });
    });
}

function createMovieCard(f, isFav) {
    const div = document.createElement("div");
    div.classList.add("movie"); // Styl z styles.css

    const posterUrl = f.poster_path 
        ? `https://image.tmdb.org/t/p/w200${f.poster_path}` 
        : "https://via.placeholder.com/150?text=No+Img";
    
    const release_year = (f.release_date || f.first_air_date || "").slice(0, 4) || "—";
    
    // Ocena i pasek
    const rawRating = f.vote_average ?? (f.rating ?? 0);
    const ratingText = rawRating ? rawRating.toFixed(1) : "0.0";
    const ratingPercent = Math.min(Math.max(rawRating * 10, 0), 100);

    const type = f.media_type || "movie";
    const detailsUrl = `/details.html?id=${f.id}&type=${type}`;
    
    const btnText = isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych";
    const btnAttr = f.id ? `data-movie-id="${f.id}"` : "";

    div.innerHTML = `
        <a href="${detailsUrl}" style="text-decoration: none; color: inherit; width: 100%;">
            <h3>${f.title || f.name} (${release_year})</h3>
        </a>
        
        <a href="${detailsUrl}" style="text-decoration: none; display: block;">
            <img src="${posterUrl}" alt="${f.title || f.name}">
        </a>
        
        <div class="movie-rating-box">
            <p style="margin: 0; display: flex; align-items: center; gap: 5px; justify-content: center;">
                <span style="color: #f5c518; font-size: 1.2em;">★</span> 
                Ocena: ${ratingText}
            </p>
            <div class="rating-bar">
                <div class="rating-fill" style="width: ${ratingPercent}%;"></div>
            </div>
        </div>

        <button class="favorite-btn" ${btnAttr}>${btnText}</button>
    `;
    return div;
}

function setupAuthButtons() {
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    if (isUserLoggedIn) {
        if (loginBtn) loginBtn.style.display = "none";
        if (logoutBtn) { 
            logoutBtn.style.display = "inline-block"; 
            logoutBtn.onclick = () => window.location.href = "/auth/logout"; 
        }
    } else {
        if (logoutBtn) logoutBtn.style.display = "none";
        if (loginBtn) { 
            loginBtn.style.display = "inline-block"; 
            loginBtn.onclick = () => window.location.href = "/auth/login"; 
        }
    }
}

function setupGlobalSearch() {
    const input = document.getElementById('global-search');
    const list = document.getElementById('search-suggestions');
    if (!input || !list) return;

    function debounce(fn, wait = 300) {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }

    async function doSearchSuggestions(q) {
        if (!q || q.trim().length < 1) { list.classList.remove('visible'); list.innerHTML = ''; return; }
        try {
            const res = await fetch(`/movies/search?q=${encodeURIComponent(q)}&limit=6`);
            if (!res.ok) return;
            const data = await res.json();
            const hits = data.results || [];
            list.innerHTML = '';
            if (!hits.length) { list.classList.remove('visible'); return; }
            
            hits.slice(0,6).forEach(item => {
                const li = document.createElement('li');
                const year = (item.release_date || item.first_air_date || '').slice(0,4);
                li.textContent = `${item.title || item.name} ${year ? '('+year+')' : ''}`;
                li.addEventListener('click', () => {
                     // Przekierowanie na home z zapytaniem
                     window.location.href = `/?q=${encodeURIComponent(item.title || item.name)}`;
                });
                list.appendChild(li);
            });
            list.classList.add('visible');
        } catch (e) {}
    }

    const debouncedSuggest = debounce(e => doSearchSuggestions(e.target.value), 250);
    input.addEventListener('input', debouncedSuggest);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const q = input.value.trim();
            if (q) window.location.href = `/?q=${encodeURIComponent(q)}`;
        } else if (e.key === 'Escape') list.classList.remove('visible');
    });
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('visible'), 150));
    input.addEventListener('focus', () => { if(input.value.trim()) doSearchSuggestions(input.value); });
}
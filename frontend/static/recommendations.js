// frontend/static/recommendations.js

const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", () => {
    setupAuthButtons();
    setupGlobalSearch();
    loadProviders(); // <-- TO WYWOŁUJE DYNAMICZNE ŁADOWANIE
});

// Pobieranie dostawców z backendu (który bierze z TMDB API)
async function loadProviders() {
    const container = document.getElementById('provider-selector');
    try {
        const res = await fetch('/movies/providers');
        if (!res.ok) throw new Error("Błąd pobierania");
        const data = await res.json();
        const providers = data.providers || [];

        if (providers.length === 0) {
            container.innerHTML = "<span style='color:#666; font-size:0.8rem;'>Nie udało się załadować listy.</span>";
            return;
        }

        container.innerHTML = ""; // Czyścimy "Ładowanie..."
        
        providers.forEach(p => {
            const div = document.createElement('div');
            div.className = 'provider-option';
            div.dataset.id = p.provider_id;
            div.title = p.provider_name;
            
            // Używamy "original", tak jak w detalach, żeby było wyraźne
            const img = document.createElement('img');
            img.src = `https://image.tmdb.org/t/p/original${p.logo_path}`;
            img.alt = p.provider_name;
            
            div.appendChild(img);
            
            // Obsługa kliknięcia (selekcja)
            div.addEventListener('click', () => {
                if (div.classList.contains('selected')) {
                    div.classList.remove('selected');
                } else {
                    document.querySelectorAll('.provider-option').forEach(el => el.classList.remove('selected'));
                    div.classList.add('selected');
                }
            });
            
            container.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = "<span style='color:red;'>Błąd.</span>";
    }
}

// ... (Reszta funkcji: validateForm, generate, fetchUserFavoritesIds, renderResults, createMovieCard, setupAuthButtons, setupGlobalSearch - POZOSTAJE BEZ ZMIAN) ...
// Wklejam je dla pewności, żebyś miał cały plik gotowy.

function validateForm() {
    if (window.currentMode !== 'advanced') {
        document.getElementById('gen-btn').disabled = false;
        document.querySelectorAll('.error-msg').forEach(el => el.style.display = 'none');
        return;
    }
    let isValid = true;
    const btn = document.getElementById('gen-btn');
    const getVal = (id) => parseFloat(document.getElementById(id).value);

    const yMin = getVal('year-min');
    const yMax = getVal('year-max');
    const yErr = document.getElementById('year-error');
    if (!isNaN(yMin) && !isNaN(yMax) && yMax < yMin) {
        yErr.style.display = 'block'; isValid = false;
    } else { yErr.style.display = 'none'; }

    const vMin = getVal('vote-min');
    const vErr = document.getElementById('vote-error');
    if (!isNaN(vMin) && (vMin < 0 || vMin > 10)) {
        vErr.style.display = 'block'; isValid = false;
    } else { vErr.style.display = 'none'; }

    const rMin = getVal('runtime-min');
    const rMax = getVal('runtime-max');
    const rErr = document.getElementById('runtime-error');
    if (!isNaN(rMin) && !isNaN(rMax) && rMax < rMin) {
        rErr.style.display = 'block'; isValid = false;
    } else { rErr.style.display = 'none'; }

    btn.disabled = !isValid;
}

async function generate() {
    const btn = document.querySelector('.big-btn');
    const container = document.getElementById('results-area');
    
    btn.disabled = true;
    btn.textContent = "Analizuję (to chwilę potrwa)...";
    container.innerHTML = "<div class='loader'>🔍 Przeszukuję bazę danych...</div>";

    try {
        const mode = window.currentMode || 'quick';
        const targetInput = document.querySelector('input[name="target"]:checked');
        if (!targetInput) throw new Error("Nie wybrano typu");
        const target = targetInput.value;
        
        let payload = {
            mode: mode,
            target_type: target,
            use_favorites: true
        };

        if (mode === 'advanced') {
            const useFavEl = document.getElementById('use-fav');
            payload.use_favorites = useFavEl ? useFavEl.checked : true;
            
            const checkedBoxes = document.querySelectorAll('input[name="genre"]:checked');
            const genresList = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
            const genreModeInput = document.querySelector('input[name="genre-mode"]:checked');
            const genreMode = genreModeInput ? genreModeInput.value : 'or';

            const getVal = (id) => { const el = document.getElementById(id); return el ? (parseInt(el.value) || null) : null; };
            const getFloat = (id) => { const el = document.getElementById(id); return el ? (parseFloat(el.value) || null) : null; };
            const getString = (id) => { const el = document.getElementById(id); return (el && el.value) ? el.value : null; };

            // Pobieranie wybranego providera z UI (teraz dynamicznie wygenerowanego)
            const selectedProviderEl = document.querySelector('.provider-option.selected');
            const providerId = selectedProviderEl ? selectedProviderEl.getAttribute('data-id') : null;

            payload.filters = {
                genres: genresList,
                genre_mode: genreMode,
                year_min: getVal('year-min'),
                year_max: getVal('year-max'),
                vote_min: getFloat('vote-min'),
                runtime_min: getVal('runtime-min'),
                runtime_max: getVal('runtime-max'),
                country: getString('country-select'),
                preference: getString('pref-select'),
                mood: getString('mood-select'),
                provider: providerId
            };
        }

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
        container.innerHTML = `<p style='color:red; text-align:center; margin-top: 20px; font-size:1.2rem;'>Wystąpił błąd: ${err.message}</p>`;
    } finally {
        btn.textContent = "Generuj Rekomendacje 🎲";
        btn.disabled = false;
        validateForm(); 
    }
}

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
        container.innerHTML = "<h3 style='text-align:center; margin-top:40px; color:#fff;'>Brak wyników :(</h3>";
        return;
    }
    
    container.innerHTML = `<div class="movies-grid"></div>`;
    const grid = container.querySelector('.movies-grid');
    const favIds = await fetchUserFavoritesIds();

    movies.forEach(f => {
        const isFav = favIds.includes(f.id);
        const card = createMovieCard(f, isFav);
        grid.appendChild(card);
    });

    grid.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const movieId = btn.dataset.movieId;
            if (!movieId) return;
            if (!isUserLoggedIn) { window.location.href = "/auth/login"; return; }
            
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = "...";
            try {
                const res = await fetch(`/user/favorite/${movieId}`, { method: "POST", credentials: "same-origin" });
                if (res.ok) {
                    const data = await res.json();
                    btn.textContent = data.removed ? "Dodaj do ulubionych" : "Usuń z ulubionych";
                } else { btn.textContent = originalText; }
            } catch (err) { btn.textContent = originalText; }
            finally { btn.disabled = false; }
        });
    });
}

function createMovieCard(movie, isFav) {
    const div = document.createElement("div");
    div.classList.add("movie");

    const posterUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` 
        : "https://via.placeholder.com/200x300?text=Brak+Okładki";
    
    const title = movie.title || movie.name;
    const releaseDate = movie.release_date || movie.first_air_date || "";
    const year = releaseDate ? `(${releaseDate.slice(0, 4)})` : "";
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "—";
    const ratingPercent = Math.min(Math.max((movie.vote_average || 0) * 10, 0), 100);
    const btnText = isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych";
    const mediaType = movie.media_type || (movie.title ? "movie" : "tv"); 

    let runtimeHtml;
    if (movie.runtime && movie.runtime > 0) {
        const h = Math.floor(movie.runtime / 60);
        const m = movie.runtime % 60;
        const timeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
        runtimeHtml = `<div style="font-size:0.85rem; color:#888; margin-bottom:5px;">⏱ ${timeStr}</div>`;
    } else {
        runtimeHtml = `<div style="font-size:0.85rem; color:#888; margin-bottom:5px;">⏱ ?</div>`;
    }

    div.innerHTML = `
        <a href="/details.html?id=${movie.id}&type=${mediaType}" style="text-decoration: none; color: inherit; width: 100%;">
            <img src="${posterUrl}" alt="${title}" loading="lazy">
            <h3>${title} <small>${year}</small></h3>
        </a>
        
        <div class="movie-rating-box">
            ${runtimeHtml}
            <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                <span>Ocena: ${rating}</span>
                <span style="color: #ffcc00;">★</span>
            </div>
            <div class="rating-bar">
                <div class="rating-fill" style="width: ${ratingPercent}%;"></div>
            </div>
        </div>

        <button class="favorite-btn" data-movie-id="${movie.id}">${btnText}</button>
    `;
    return div;
}

// ... helpery ...
function setupAuthButtons() {
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    if (isUserLoggedIn) {
        if (loginBtn) loginBtn.style.display = "none";
        if (logoutBtn) { logoutBtn.style.display = "inline-block"; logoutBtn.onclick = () => window.location.href = "/auth/logout"; }
    } else {
        if (logoutBtn) logoutBtn.style.display = "none";
        if (loginBtn) { loginBtn.style.display = "inline-block"; loginBtn.onclick = () => window.location.href = "/auth/login"; }
    }
}

function setupGlobalSearch() {
    const input = document.getElementById('global-search');
    const list = document.getElementById('search-suggestions');
    if (!input || !list) return;
    function debounce(fn, wait = 300) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
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
                li.addEventListener('click', () => { window.location.href = `/?q=${encodeURIComponent(item.title || item.name)}`; });
                list.appendChild(li);
            });
            list.classList.add('visible');
        } catch (e) {}
    }
    const debouncedSuggest = debounce(e => doSearchSuggestions(e.target.value), 250);
    input.addEventListener('input', debouncedSuggest);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const q = input.value.trim(); if (q) window.location.href = `/?q=${encodeURIComponent(q)}`; }
    });
}
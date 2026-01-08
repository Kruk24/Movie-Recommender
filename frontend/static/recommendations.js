// static/recommendations.js

const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", () => {
    setupAuthButtons();
    setupGlobalSearch();
});

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
    // Nowy, ładniejszy loader
    container.innerHTML = "<div class='loader-text'>🔍 Przeszukuję bazę danych...</div>";

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

            payload.filters = {
                genres: genresList,
                genre_mode: genreMode,
                year_min: getVal('year-min'),
                year_max: getVal('year-max'),
                vote_min: getFloat('vote-min'),
                runtime_min: getVal('runtime-min'),
                runtime_max: getVal('runtime-max'),
                country: getString('country-select'),
                preference: getString('pref-select')
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
        validateForm(); 
        if (!document.getElementById('year-error').style.display || document.getElementById('year-error').style.display === 'none') {
             btn.disabled = false;
        }
        btn.textContent = "Generuj Rekomendacje 🎲";
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

    movies.forEach((f, index) => {
        const isFav = favIds.includes(f.id);
        const card = createMovieCard(f, isFav);
        
        // --- ANIMACJA: KASKADOWE WEJŚCIE ---
        // Dodajemy opóźnienie animacji dla każdego kolejnego kafelka
        card.style.animationDelay = `${index * 50}ms`; 
        
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

function createMovieCard(f, isFav) {
    const div = document.createElement("div");
    div.classList.add("movie");

    const posterUrl = f.poster_path 
        ? `https://image.tmdb.org/t/p/w200${f.poster_path}` 
        : "https://via.placeholder.com/200x300?text=Brak+Okładki";
    
    const release_year = (f.release_date || f.first_air_date || "").slice(0, 4) || "—";
    const rawRating = f.vote_average ?? 0;
    const ratingText = rawRating ? rawRating.toFixed(1) : "0.0";
    const ratingPercent = Math.min(Math.max(rawRating * 10, 0), 100);
    const type = f.media_type || "movie";
    const detailsUrl = `/details.html?id=${f.id}&type=${type}`;
    const btnText = isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych";
    const btnAttr = f.id ? `data-movie-id="${f.id}"` : "";
    
    let runtimeHtml;
    if (f.runtime && f.runtime > 0) {
        runtimeHtml = `<div style="margin-top:5px; font-size:0.85rem; color:#444; font-weight:bold;">⏱ ${f.runtime} min</div>`;
    } else {
        runtimeHtml = `<div style="margin-top:5px; font-size:0.85rem; color:#777;">Czas: ?</div>`;
    }

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
            ${runtimeHtml}
        </div>
        <button class="favorite-btn" ${btnAttr}>${btnText}</button>
    `;
    return div;
}

// ... helpery bez zmian ...
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
                li.addEventListener('click', () => window.location.href = `/?q=${encodeURIComponent(item.title || item.name)}`);
                list.appendChild(li);
            });
            list.classList.add('visible');
        } catch (e) {}
    }
    const debouncedSuggest = debounce(e => doSearchSuggestions(e.target.value), 250);
    input.addEventListener('input', debouncedSuggest);
    input.addEventListener('focus', () => { if(input.value.trim()) doSearchSuggestions(input.value); });
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('visible'), 150));
}
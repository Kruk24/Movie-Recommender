const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", async () => {
    setupAuthButtons();
    setupDetailsSearch();

    const params = new URLSearchParams(window.location.search);
    const tmdbId = params.get("id");
    const mediaType = params.get("type") || "movie";

    if (!tmdbId) {
        document.getElementById("details-root").innerHTML = "<p style='text-align:center; padding:50px;'>Brak identyfikatora.</p>";
        return;
    }

    try {
        const res = await fetch(`/movies/details/${mediaType}/${tmdbId}`);
        if (!res.ok) throw new Error("Błąd pobierania danych");
        const data = await res.json();
        renderDetails(data);
    } catch (err) {
        console.error(err);
        document.getElementById("details-root").innerHTML = "<p style='text-align:center; padding:50px; color:red;'>Nie udało się pobrać szczegółów.</p>";
    }
});

async function renderDetails(movie) {
    const container = document.getElementById("details-root");
    let isFav = false;
    if (isUserLoggedIn) {
        try {
            const favRes = await fetch("/user/favorites.json", { credentials: "same-origin" });
            if (favRes.ok) {
                const favData = await favRes.json();
                isFav = favData.favorites.some(f => f.id === movie.id);
            }
        } catch(e) {}
    }

    // Obrazy
    const backdropUrl = movie.backdrop_path 
        ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` 
        : ""; // Puste tło, jeśli brak
    const posterUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
        : "https://via.placeholder.com/300x450?text=Brak+Okładki";

    // Meta dane
    const year = (movie.release_date || movie.first_air_date || "").slice(0,4);
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "—";
    
    // Czas trwania
    let duration = 0;
    if (movie.runtime) duration = movie.runtime;
    else if (movie.episode_run_time && movie.episode_run_time.length) duration = movie.episode_run_time[0];
    
    let runtimeStr = "";
    if (duration > 0) {
        const h = Math.floor(duration / 60);
        const m = duration % 60;
        runtimeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
    } else {
        runtimeStr = "Czas nieznany";
    }

    const genresList = movie.genres ? movie.genres.map(g => g.name).join(", ") : "Brak gatunków";
    const directors = movie.directors ? movie.directors.map(d => d.name).join(", ") : "—";

    // Obsada (Scroller)
    const castHtml = (movie.cast || []).map(actor => {
        const pic = actor.profile_path ? `https://image.tmdb.org/t/p/w200${actor.profile_path}` : "https://via.placeholder.com/150?text=Brak";
        return `
            <div class="cast-card">
                <img src="${pic}" alt="${actor.name}">
                <div class="cast-info">
                    <span class="cast-name">${actor.name}</span>
                    <span class="cast-char">${actor.character || ""}</span>
                </div>
            </div>`;
    }).join("");

    // Providerzy
    let providersHtml = "";
    const providers = movie["watch/providers"]?.results?.PL?.flatrate || movie.watch_providers || [];
    if (providers.length > 0) {
        providersHtml = providers.map(p => 
            `<img src="https://image.tmdb.org/t/p/original${p.logo_path}" class="provider-logo" title="${p.provider_name}">`
        ).join("");
    } else {
        providersHtml = "<span style='opacity:0.6; font-size:0.9rem;'>Brak informacji o streamingu w PL.</span>";
    }

    // HTML Structure
    const backdropStyle = backdropUrl ? `background-image: url('${backdropUrl}');` : "background-color: #222;";

    container.innerHTML = `
        <div class="backdrop-container" style="${backdropStyle}">
            <div class="backdrop-overlay"></div>
            
            <div class="details-content-wrapper">
                <div class="poster-card">
                    <img src="${posterUrl}" alt="${movie.title}">
                    <div style="padding: 15px; background: rgba(0,0,0,0.6);">
                        <button id="fav-btn-detail" class="action-btn" style="width:100%; justify-content:center;">
                            ${isFav ? "Usuń z ulubionych 💔" : "Dodaj do ulubionych ❤️"}
                        </button>
                    </div>
                </div>

                <div class="info-col">
                    <h2 class="movie-title">${movie.title || movie.name} <span class="year-tag">(${year})</span></h2>
                    
                    <div class="meta-row">
                        <div class="score-circle">⭐ ${rating}</div>
                        <span class="badge">⏱ ${runtimeStr}</span>
                        <span class="badge">${genresList}</span>
                    </div>

                    ${movie.tagline ? `<p class="tagline">"${movie.tagline}"</p>` : ""}

                    <div class="overview-section">
                        <h3>Opis</h3>
                        <p class="overview-text">${movie.overview || "Brak opisu w języku polskim."}</p>
                    </div>

                    <div class="overview-section">
                        <h3>Twórcy</h3>
                        <p>${directors}</p>
                    </div>

                    <div class="overview-section">
                        <h3>Gdzie obejrzeć</h3>
                        <div class="providers-row">${providersHtml}</div>
                    </div>

                    <div class="overview-section">
                        <h3>Obsada</h3>
                        <div class="cast-scroller">
                            ${castHtml}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Listener przycisku
    const btn = document.getElementById("fav-btn-detail");
    btn.addEventListener("click", async () => {
        if (!isUserLoggedIn) { window.location.href = "/auth/login"; return; }
        btn.disabled = true;
        const originalText = btn.innerHTML;
        btn.innerHTML = "Przetwarzanie...";
        try {
            const res = await fetch(`/user/favorite/${movie.id}`, { method: "POST", credentials: "same-origin" });
            if (res.ok) {
                const d = await res.json();
                btn.innerHTML = d.removed ? "Dodaj do ulubionych ❤️" : "Usuń z ulubionych 💔";
            } else { btn.innerHTML = originalText; }
        } catch (e) { btn.innerHTML = originalText; } 
        finally { btn.disabled = false; }
    });
}

// Helpers
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

function setupDetailsSearch() {
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
        else if (e.key === 'Escape') list.classList.remove('visible');
    });
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('visible'), 150));
    input.addEventListener('focus', () => { if(input.value.trim()) doSearchSuggestions(input.value); });
}
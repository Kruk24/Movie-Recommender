const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", async () => {
    setupAuthButtons();
    setupDetailsSearch();

    const params = new URLSearchParams(window.location.search);
    const tmdbId = params.get("id");
    const mediaType = params.get("type") || "movie";

    if (!tmdbId) {
        document.getElementById("details-container").innerHTML = "<p style='text-align:center; padding:50px;'>Brak ID filmu.</p>";
        return;
    }

    try {
        const res = await fetch(`/movies/details/${mediaType}/${tmdbId}`);
        if (!res.ok) throw new Error("Błąd");
        const data = await res.json();
        renderDetails(data);
    } catch (err) {
        console.error(err);
        document.getElementById("details-container").innerHTML = "<p style='text-align:center; padding:50px; color:#e50914;'>Nie udało się pobrać szczegółów.</p>";
    }
});

// Funkcja pomocnicza do zamiany listy obiektów (np. [{name: 'USA'}]) na string "USA"
function formatList(list) {
    if (!list || list.length === 0) return "—";
    // Sprawdzamy czy elementy to obiekty z polem 'name', czy stringi
    return list.map(item => (typeof item === 'object' && item.name) ? item.name : item).join(", ");
}

async function renderDetails(movie) {
    const container = document.getElementById("details-container");
    
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

    const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : "";
    const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "https://via.placeholder.com/300x450";
    const year = (movie.release_date || movie.first_air_date || "").slice(0,4);
    const typeLabel = movie.media_type === "tv" ? "Serial" : "Film";
    
    // Czas trwania
    let duration = 0;
    if (movie.runtime) duration = movie.runtime;
    else if (movie.episode_run_time && movie.episode_run_time.length) duration = movie.episode_run_time[0];
    
    let runtimeStr = "Czas nieznany";
    if (duration > 0) {
        const h = Math.floor(duration / 60);
        const m = duration % 60;
        runtimeStr = h > 0 ? `${h}h ${m}min` : `${m}min`;
    }

    // NAPRAWA [object Object]: Używamy funkcji formatList
    const genres = formatList(movie.genres);
    const countries = formatList(movie.production_countries);
    
    // Reżyserzy (czasem są obiektami, czasem stringami z backendu - tu zakładamy obiekty z backendu api/movies.py)
    // Backend API zwracał listę, więc:
    let directorsStr = "—";
    if (movie.directors && movie.directors.length > 0) {
        directorsStr = formatList(movie.directors);
    }

    const bgStyle = backdrop ? `background-image: url('${backdrop}');` : "background-color: #222;";

    const castHtml = (movie.cast || []).map(a => {
        const p = a.profile_path ? `https://image.tmdb.org/t/p/w200${a.profile_path}` : "https://via.placeholder.com/150?text=Brak";
        return `
            <div class="cast-card">
                <img src="${p}" alt="${a.name}">
                <div class="cast-info">
                    <div style="font-weight:bold; font-size:0.9rem;">${a.name}</div>
                    <div style="font-size:0.75rem; opacity:0.7;">${a.character || ""}</div>
                </div>
            </div>`;
    }).join("");

    let providersHtml = "";
    const providers = movie["watch/providers"]?.results?.PL?.flatrate || movie.watch_providers || [];
    if (providers.length > 0) {
        providersHtml = providers.map(p => 
            `<img src="https://image.tmdb.org/t/p/original${p.logo_path}" class="provider-logo" title="${p.provider_name}">`
        ).join("");
    } else {
        providersHtml = "<span style='opacity:0.6; font-size:0.9rem;'>Brak informacji o streamingu w PL.</span>";
    }

    container.innerHTML = `
        <div class="hero-container" style="${bgStyle}">
            <div class="hero-overlay"></div>
            <div class="details-content">
                <div class="poster-wrapper">
                    <img src="${poster}" alt="${movie.title}">
                    <div style="background:rgba(0,0,0,0.8); padding:15px; text-align:center;">
                        <button id="fav-btn-detail" class="action-btn" style="width:100%;">
                            ${isFav ? "Usuń z ulubionych 💔" : "Dodaj do ulubionych ❤️"}
                        </button>
                    </div>
                </div>
                <div class="info-wrapper">
                    <h2>${movie.title || movie.name} <span style="font-weight:300; opacity:0.7;">(${year})</span></h2>
                    
                    <div class="meta-data">
                        <span class="score">★ ${movie.vote_average ? movie.vote_average.toFixed(1) : "0.0"}</span>
                        <span class="badge">${typeLabel}</span>
                        <span class="badge">⏱ ${runtimeStr}</span>
                        <span class="badge">${genres}</span>
                    </div>

                    <div class="description">
                        ${movie.overview || "Brak opisu."}
                    </div>

                    <div class="crew-grid">
                        <div class="crew-item">
                            <strong>Reżyseria / Twórcy</strong>
                            <span>${directorsStr}</span>
                        </div>
                        <div class="crew-item">
                            <strong>Kraj produkcji</strong>
                            <span>${countries}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="extra-section">
            <div class="section-header">Obsada</div>
            <div class="cast-row">
                ${castHtml}
            </div>
        </div>

        <div class="extra-section">
            <div class="section-header">Gdzie obejrzeć</div>
            <div class="providers-row">
                ${providersHtml}
            </div>
        </div>
    `;

    const btn = document.getElementById("fav-btn-detail");
    btn.addEventListener("click", async () => {
        if (!isUserLoggedIn) { window.location.href = "/auth/login"; return; }
        btn.disabled = true;
        const oldText = btn.innerHTML;
        btn.innerHTML = "Przetwarzanie...";
        try {
            const res = await fetch(`/user/favorite/${movie.id}`, { method: "POST", credentials: "same-origin" });
            if (res.ok) {
                const d = await res.json();
                btn.innerHTML = d.removed ? "Dodaj do ulubionych ❤️" : "Usuń z ulubionych 💔";
            } else { btn.innerHTML = oldText; }
        } catch(e) { btn.innerHTML = oldText; }
        finally { btn.disabled = false; }
    });
}

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
    // Standardowa funkcja search... (skopiuj z poprzednich, jeśli brakuje, ale powinna być w pliku)
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
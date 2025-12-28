// /static/details.js
const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", async () => {
    setupAuthButtons();
    setupDetailsSearch();

    const params = new URLSearchParams(window.location.search);
    const tmdbId = params.get("id");
    const mediaType = params.get("type") || "movie";

    if (!tmdbId) {
        document.getElementById("details-container").innerHTML = "<p>Brak identyfikatora filmu.</p>";
        return;
    }

    try {
        const res = await fetch(`/movies/details/${mediaType}/${tmdbId}`);
        if (!res.ok) throw new Error("Błąd pobierania danych");
        const data = await res.json();
        renderDetails(data);
    } catch (err) {
        console.error(err);
        document.getElementById("details-container").innerHTML = "<p>Nie udało się pobrać szczegółów.</p>";
    }
});

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

    const posterUrl = movie.poster_path 
        ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` 
        : "https://via.placeholder.com/300x450?text=Brak+plakatu"; // Fallback w details
    
    const year = (movie.release_date || "").slice(0,4);
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : "—";
    
    // KROK 3: Wyświetlanie typu (Film/Serial)
    const typeLabel = (movie.media_type === "tv") ? "Serial" : "Film";

    const castHtml = movie.cast.map(actor => {
        const pic = actor.profile_path 
            ? `https://image.tmdb.org/t/p/w200${actor.profile_path}` 
            : "https://via.placeholder.com/100?text=Brak";
        return `
            <div class="cast-member">
                <img src="${pic}" alt="${actor.name}">
                <div><strong>${actor.name}</strong></div>
                <div style="color:#777; font-size:0.75rem;">${actor.character || ""}</div>
            </div>`;
    }).join("");

    let providersHtml = "Brak informacji o streamingu w PL.";
    if (movie.watch_providers && movie.watch_providers.length > 0) {
        providersHtml = movie.watch_providers.map(prov => 
            `<img src="https://image.tmdb.org/t/p/original${prov.logo_path}" class="provider-logo" title="${prov.name}" alt="${prov.name}">`
        ).join("");
    }

    container.innerHTML = `
        <div class="movie-details-grid">
            <div class="details-poster">
                <img src="${posterUrl}" alt="${movie.title}">
                <button id="fav-btn-detail" class="action-btn" style="width:100%; margin-top:15px;">
                    ${isFav ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                </button>
            </div>
            
            <div class="details-info">
                <h2>${movie.title} <span style="font-weight:300; color:#555;">(${year})</span></h2>
                
                <div class="meta-info">
                    <span class="rating-badge" style="background:#444; color:#fff;">${typeLabel}</span>
                    <span class="rating-badge">★ ${rating}</span>
                    <span>${movie.genres.join(", ")}</span>
                    <span>${movie.production_countries.join(", ")}</span>
                </div>

                <div style="margin-bottom: 20px; line-height: 1.6;">
                    <strong>Opis:</strong><br>
                    ${movie.overview || "Brak opisu w języku polskim."}
                </div>

                <div style="margin-bottom: 20px;">
                    <strong>Reżyseria / Twórcy:</strong> ${movie.directors.join(", ") || "—"}
                </div>

                <div class="section-title">Obsada</div>
                <div class="cast-grid">
                    ${castHtml}
                </div>

                <div class="section-title">Gdzie obejrzeć (Streaming PL)</div>
                <div class="providers-list">
                    ${providersHtml}
                </div>
            </div>
        </div>
    `;

    // Obsługa przycisku ulubionych
    const btn = document.getElementById("fav-btn-detail");
    btn.addEventListener("click", async () => {
        if (!isUserLoggedIn) { window.location.href = "/auth/login"; return; }
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "Przetwarzanie...";
        try {
            const res = await fetch(`/user/favorite/${movie.id}`, { method: "POST", credentials: "same-origin" });
            if (res.ok) {
                const d = await res.json();
                btn.textContent = d.removed ? "Dodaj do ulubionych" : "Usuń z ulubionych";
            } else { btn.textContent = originalText; }
        } catch (e) { btn.textContent = originalText; } 
        finally { btn.disabled = false; }
    });
}
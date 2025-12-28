// /static/favorites.js

const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Obsługa UI (przyciski logowania i wyszukiwarka)
    setupAuthButtons();
    setupFavoritesSearch();

    const container = document.getElementById("movies-container");
    if (!container) return;

    if (!isUserLoggedIn) {
        container.innerHTML = '<p style="text-align:center; margin-top:50px;">Musisz być zalogowany, aby widzieć ulubione.</p>';
        return;
    }

    // 2. Pobieranie danych
    try {
        const res = await fetch("/user/favorites.json", { credentials: "same-origin" });
        if (!res.ok) throw new Error("Błąd pobierania ulubionych");
        
        const data = await res.json();
        const movies = data.favorites || [];

        renderFavorites(movies, container);

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="text-align:center; color: red;">Nie udało się pobrać listy ulubionych.</p>';
    }
});

// --- Funkcje Renderujące ---

function renderFavorites(movies, container) {
    container.innerHTML = "";

    if (movies.length === 0) {
        container.innerHTML = "<h2>Twoje ulubione filmy</h2><p>Twoja lista jest pusta.</p>";
        return;
    }

    // Nagłówek
    const h2 = document.createElement("h2");
    h2.textContent = `Twoje ulubione (${movies.length})`;
    container.appendChild(h2);

    // Grid (siatka)
    const grid = document.createElement("div");
    grid.classList.add("movies-grid"); // Klasa z CSS zapewniająca wygląd
    container.appendChild(grid);

    // Generowanie kart
    movies.forEach(f => {
        const card = createFavoriteCard(f);
        grid.appendChild(card);
    });
}

function createFavoriteCard(f) {
    const div = document.createElement("div");
    div.classList.add("movie");

    const posterUrl = f.poster_path 
        ? `https://image.tmdb.org/t/p/w200${f.poster_path}` 
        : (f.poster || "https://via.placeholder.com/150?text=No+Img");
    
    // 1. Pobieramy rok bezpiecznie
    const rawDate = f.release_date || f.first_air_date;
    const year = rawDate ? rawDate.slice(0, 4) : "";
    
    // 2. Tworzymy zmienną z nawiasem TYLKO jeśli rok istnieje
    // Jeśli roku nie ma, zmienna będzie pusta (brak brzydkiego "(-)")
    const yearHtml = year ? ` (${year})` : "";
    
    // Ocena
    const rawRating = f.vote_average ?? (f.rating ?? 0);
    const ratingText = rawRating ? rawRating.toFixed(1) : "0.0";
    const ratingPercent = Math.min(Math.max(rawRating * 10, 0), 100);

    const type = f.media_type || "movie";
    const detailsUrl = `/details.html?id=${f.id}&type=${type}`;

    div.innerHTML = `
        <a href="${detailsUrl}" style="text-decoration: none; color: inherit; width: 100%;">
            <h3>${f.title || f.name}${yearHtml}</h3>
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

        <button class="favorite-btn remove-btn" data-movie-id="${f.id}">Usuń z ulubionych</button>
    `;

    // Obsługa usuwania (bez zmian)
    const btn = div.querySelector(".favorite-btn");
    btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Usuwanie...";
        try {
            const res = await fetch(`/user/favorite/${f.id}`, { method: "POST", credentials: "same-origin" });
            if (res.ok) {
                div.remove();
                const h2 = document.querySelector("#movies-container h2");
                if (h2) {
                    const currentCount = parseInt(h2.textContent.match(/\d+/)) || 0;
                    const newCount = Math.max(0, currentCount - 1);
                    h2.textContent = `Twoje ulubione (${newCount})`;
                    if (newCount === 0) {
                        document.querySelector("#movies-container").innerHTML = "<h2>Twoje ulubione filmy</h2><p>Twoja lista jest pusta.</p>";
                    }
                }
            } else {
                alert("Wystąpił błąd podczas usuwania.");
                btn.textContent = "Usuń z ulubionych";
                btn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            btn.disabled = false;
        }
    });

    return div;
}

// --- Funkcje Pomocnicze (Auth & Search) ---

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

function setupFavoritesSearch() {
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
                     // Przekierowanie na home
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
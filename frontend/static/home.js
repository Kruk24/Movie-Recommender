const isUserLoggedIn = (typeof loggedIn !== 'undefined') ? loggedIn : false;

document.addEventListener("DOMContentLoaded", () => {
    setupButtons();
    setupAuthButtons();
    setupGlobalSearch();
    
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");

    if (query) {
        searchMovies(query);
        setActiveButton(null);
    } else {
        // Domyślny start
        loadMovies('/movies/trending');
        setActiveButton('popular-btn'); 
    }
});

function setupButtons() {
    const popBtn = document.getElementById("popular-btn");
    const topBtn = document.getElementById("toprated-btn");
    const revBtn = document.getElementById("revenue-btn");
    const favBtn = document.getElementById("favorites-btn");
    
    // NOWY PRZYCISK: Szczęśliwy Traf
    const luckyBtn = document.getElementById("lucky-btn");

    if(popBtn) {
        popBtn.addEventListener("click", () => {
            loadMovies('/movies/trending');
            setActiveButton('popular-btn');
        });
    }

    if(topBtn) {
        topBtn.addEventListener("click", () => {
            loadMovies('/movies/top_rated');
            setActiveButton('toprated-btn');
        });
    }

    if(revBtn) {
        revBtn.addEventListener("click", () => {
            loadMovies('/movies/revenue');
            setActiveButton('revenue-btn');
        });
    }

    if(favBtn) {
        favBtn.addEventListener("click", () => {
            if(!isUserLoggedIn) {
                window.location.href = "/auth/login";
            } else {
                window.location.href = "/user/favorites";
            }
        });
    }

    // OBSŁUGA SZCZĘŚLIWEGO TRAFU
    if (luckyBtn) {
        luckyBtn.addEventListener("click", async () => {
            luckyBtn.disabled = true;
            luckyBtn.textContent = "Losowanie...";
            try {
                const res = await fetch('/movies/lucky');
                if (!res.ok) throw new Error("Błąd");
                const data = await res.json();
                // Przekierowanie do detali wylosowanego filmu
                window.location.href = `/details.html?id=${data.id}&type=${data.type}`;
            } catch (e) {
                console.error(e);
                luckyBtn.textContent = "Błąd :(";
                setTimeout(() => {
                    luckyBtn.disabled = false;
                    luckyBtn.textContent = "Szczęśliwy Traf 🍀";
                }, 2000);
            }
        });
    }
}

function setActiveButton(activeBtnId) {
    const tabButtons = ['popular-btn', 'toprated-btn', 'revenue-btn'];

    tabButtons.forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.classList.remove('active');
    });

    if (activeBtnId) {
        const btn = document.getElementById(activeBtnId);
        if(btn) btn.classList.add('active');
    }
}

async function loadMovies(endpoint) {
    const container = document.getElementById("movies-container");
    container.innerHTML = '<div class="loader">Ładowanie filmów...</div>';

    try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("Błąd sieci");
        const data = await res.json();
        renderMovies(data.results);
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="error">Nie udało się pobrać filmów.</p>';
    }
}

async function searchMovies(query) {
    const container = document.getElementById("movies-container");
    container.innerHTML = '<div class="loader">Szukam...</div>';
    
    try {
        const res = await fetch(`/movies/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Błąd");
        const data = await res.json();
        renderMovies(data.results);
    } catch (err) {
        container.innerHTML = '<p class="error">Błąd wyszukiwania.</p>';
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

async function renderMovies(movies) {
    const container = document.getElementById("movies-container");
    
    if (!movies || movies.length === 0) {
        container.innerHTML = "<p style='grid-column: 1/-1; text-align: center;'>Brak wyników.</p>";
        return;
    }

    const favIds = await fetchUserFavoritesIds();
    container.innerHTML = ""; 
    
    movies.forEach(movie => {
        const isFav = favIds.includes(movie.id);
        const card = createMovieCard(movie, isFav);
        container.appendChild(card);
    });

    document.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const movieId = btn.dataset.movieId;
            if(!movieId) return;
            if(!isUserLoggedIn) { window.location.href = "/auth/login"; return; }

            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = "...";

            try {
                const res = await fetch(`/user/favorite/${movieId}`, { method: "POST", credentials: "same-origin" });
                if(res.ok) {
                    const data = await res.json();
                    btn.textContent = data.added ? "Usuń z ulubionych" : "Dodaj do ulubionych";
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

    div.innerHTML = `
        <a href="/details.html?id=${movie.id}&type=${mediaType}" style="text-decoration: none; color: inherit; width: 100%;">
            <img src="${posterUrl}" alt="${title}" loading="lazy">
            <h3>${title} <small>${year}</small></h3>
        </a>
        
        <div class="movie-rating-box">
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
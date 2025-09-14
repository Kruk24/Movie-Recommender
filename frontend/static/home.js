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

// eventy UI
document.addEventListener("DOMContentLoaded", () => {
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
});

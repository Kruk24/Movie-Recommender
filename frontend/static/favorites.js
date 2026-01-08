document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("favorites-container");
    container.innerHTML = '<div class="loader">Pobieranie...</div>';

    // Pobierz statystyki
    loadStats();

    // Pobierz listę
    try {
        const res = await fetch("/user/favorites.json", { credentials: "same-origin" });
        if (!res.ok) {
            if (res.status === 401) {
                container.innerHTML = "<p style='grid-column:1/-1; text-align:center; margin-top:50px;'>Musisz być zalogowany, aby zobaczyć ulubione.</p>";
                return;
            }
            throw new Error(`Błąd serwera: ${res.status}`);
        }
        
        const data = await res.json();
        renderFavorites(data.favorites);
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="error">Nie udało się pobrać ulubionych (${err.message}).</p>`;
    }
});

async function loadStats() {
    try {
        const res = await fetch("/user/stats", { credentials: "same-origin" });
        if(res.ok) {
            const stats = await res.json();
            document.getElementById("stat-count").textContent = stats.count;
            document.getElementById("stat-genre").textContent = stats.top_genre;
            document.getElementById("stat-rating").textContent = stats.avg_rating > 0 ? stats.avg_rating : "-";
        }
    } catch(e) { console.error("Stats error", e); }
}

function renderFavorites(movies) {
    const container = document.getElementById("favorites-container");
    
    if (!movies || movies.length === 0) {
        container.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:#888; font-size:1.2rem; margin-top:50px;'>Twoja lista jest pusta.</p>";
        return;
    }

    container.innerHTML = "";
    
    movies.forEach(movie => {
        const card = createFavCard(movie);
        container.appendChild(card);
    });

    document.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const movieId = btn.dataset.movieId;
            if(!movieId) return;
            
            btn.disabled = true;
            btn.textContent = "...";

            try {
                const res = await fetch(`/user/favorite/${movieId}`, { method: "POST", credentials: "same-origin" });
                if(res.ok) {
                    const data = await res.json();
                    if(data.removed) {
                        const card = btn.closest('.movie');
                        card.style.transform = 'scale(0.8)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            card.remove();
                            if(container.children.length === 0) {
                                container.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:#888; margin-top:50px;'>Lista jest pusta.</p>";
                            }
                            // Odśwież statystyki po usunięciu
                            loadStats();
                        }, 300);
                    }
                }
            } catch (e) {} 
            finally { if(btn) btn.disabled = false; }
        });
    });
}

function createFavCard(movie) {
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
    const mediaType = movie.media_type || "movie";

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

        <button class="favorite-btn" data-movie-id="${movie.id}">USUŃ 🗑️</button>
    `;
    return div;
}
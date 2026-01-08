document.addEventListener("DOMContentLoaded", async () => {
    const container = document.getElementById("favorites-container");
    container.innerHTML = '<div class="loader">Pobieranie...</div>';

    try {
        // Pobieramy dane
        const res = await fetch("/user/favorites.json");
        if (!res.ok) {
            // Jeśli użytkownik niezalogowany, przekieruj lub pokaż info
            if (res.status === 401) {
                container.innerHTML = "<p style='grid-column:1/-1; text-align:center;'>Musisz być zalogowany.</p>";
                return;
            }
            throw new Error("Błąd");
        }
        const data = await res.json();
        renderFavorites(data.favorites);
    } catch (err) {
        container.innerHTML = '<p class="error">Nie udało się pobrać ulubionych.</p>';
    }
});

function renderFavorites(movies) {
    const container = document.getElementById("favorites-container");
    
    if (!movies || movies.length === 0) {
        container.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:#888; font-size:1.2rem;'>Jeszcze nic nie dodałeś do ulubionych.</p>";
        return;
    }

    container.innerHTML = "";
    
    movies.forEach(movie => {
        // W ulubionych zawsze isFav = true
        const card = createFavCard(movie);
        container.appendChild(card);
    });

    // Listenery
    document.querySelectorAll(".favorite-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const movieId = btn.dataset.movieId;
            if(!movieId) return;
            
            btn.disabled = true;
            btn.textContent = "...";

            try {
                const res = await fetch(`/user/favorite/${movieId}`, { method: "POST" });
                if(res.ok) {
                    const data = await res.json();
                    if(data.removed) {
                        // Animacja usuwania
                        const card = btn.closest('.movie');
                        card.style.transform = 'scale(0.8)';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            card.remove();
                            if(container.children.length === 0) {
                                container.innerHTML = "<p style='grid-column: 1/-1; text-align:center; color:#888;'>Jeszcze nic nie dodałeś do ulubionych.</p>";
                            }
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
                <span style="color: gold;">★</span>
            </div>
            <div class="rating-bar">
                <div class="rating-fill" style="width: ${ratingPercent}%;"></div>
            </div>
        </div>

        <button class="favorite-btn" data-movie-id="${movie.id}">USUŃ Z LISTY 🗑️</button>
    `;
    return div;
}
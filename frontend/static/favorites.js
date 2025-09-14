// /static/favorites.js
document.addEventListener("DOMContentLoaded", () => {
    // loggedIn z szablonu; jeśli nie ma globalnej zmiennej, spróbuj nie robić nic
    const buttons = document.querySelectorAll(".favorite-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", async () => {
            const movieId = btn.dataset.movieId;
            if (!movieId) return;
            if (!loggedIn) { window.location.href = "/auth/login"; return; }

            try {
                const res = await fetch(`/user/favorite/${movieId}`, { method: "POST", credentials: "same-origin" });
                if (!res.ok) {
                    console.error("toggle favorite error", await res.text());
                    return;
                }
                const data = await res.json();
                if (data.removed) {
                    // usunięto — usuń z DOM
                    btn.closest(".movie").remove();
                } else {
                    btn.textContent = "Usuń z ulubionych";
                }
            } catch (err) {
                console.error(err);
            }
        });
    });
});

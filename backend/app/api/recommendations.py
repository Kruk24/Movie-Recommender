<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <title>Centrum Rekomendacji</title>
    <link rel="stylesheet" href="/static/styles.css">
    <style>
        /* Specyficzne style dla formularza rekomendacji */
        .rec-container {
            max-width: 1200px;
            margin: 40px auto;
            padding: 20px 100px;
            color: #222;
        }
        @media (max-width: 768px) { .rec-container { padding: 20px; } }

        .rec-controls {
            background: #fff;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            margin-bottom: 30px;
        }

        .mode-switch {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            border-bottom: 2px solid #eee;
            padding-bottom: 15px;
        }
        .mode-btn {
            background: none;
            border: none;
            font-size: 1.2rem;
            cursor: pointer;
            padding: 10px;
            font-weight: bold;
            color: #888;
        }
        .mode-btn.active {
            color: #e50914;
            border-bottom: 3px solid #e50914;
        }

        .form-group { margin-bottom: 15px; }
        .form-row { display: flex; gap: 20px; flex-wrap: wrap; }
        .form-col { flex: 1; min-width: 200px; }
        
        label { display: block; font-weight: bold; margin-bottom: 5px; font-size: 0.9rem; }
        select, input[type="number"] {
            width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 5px;
        }

        .weight-control {
            display: flex; align-items: center; gap: 10px; margin-top: 5px;
        }
        .weight-label { font-size: 0.8rem; color: #666; }

        .big-btn {
            width: 100%;
            padding: 15px;
            background: #e50914;
            color: white;
            font-size: 1.2rem;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 20px;
            transition: background 0.2s;
        }
        .big-btn:hover { background: #b20710; }
        
        .hidden { display: none; }
    </style>
</head>
<body>
    <header class="site-header">
        <h1><a href="/" style="text-decoration: none; color: inherit;">Film Recommender</a></h1>
        
        <div class="global-search-wrapper">
            <div class="global-search">
                <input id="global-search" type="search" placeholder="Search movies, series..." aria-label="Search movies" autocomplete="off" />
                <ul id="search-suggestions" class="suggestions" role="listbox" aria-live="polite"></ul>
            </div>
        </div>

        <nav>
            <button onclick="window.location.href='/'">❮ Wróć</button>
            <button id="login-btn">Zaloguj</button>
            <button id="logout-btn">Wyloguj</button>
        </nav>
    </header>

    <main class="rec-container">
        <h1>Znajdź coś dla siebie</h1>
        
        <div class="rec-controls">
            <div class="mode-switch">
                <button class="mode-btn active" onclick="setMode('quick')">Szybki Strzał</button>
                <button class="mode-btn" onclick="setMode('advanced')">Zaawansowany</button>
            </div>

            <div class="form-group">
                <label>Czego szukasz?</label>
                <div style="display:flex; gap:20px;">
                    <label style="font-weight:normal;"><input type="radio" name="target" value="movie" checked> Filmy</label>
                    <label style="font-weight:normal;"><input type="radio" name="target" value="tv"> Seriale</label>
                    <label style="font-weight:normal;"><input type="radio" name="target" value="both"> Wszystko</label>
                </div>
            </div>

            <div id="advanced-panel" class="hidden">
                <div class="form-group">
                    <label><input type="checkbox" id="use-fav" checked> Uwzględnij moje ulubione (podbij wyniki)</label>
                </div>
                
                <div class="form-row">
                    <div class="form-col">
                        <label>Lata produkcji (Od - Do)</label>
                        <div style="display:flex; gap:10px;">
                            <input type="number" id="year-min" placeholder="1990">
                            <input type="number" id="year-max" placeholder="2025">
                        </div>
                        <div class="weight-control">
                            <span class="weight-label">Waga:</span>
                            <input type="range" id="w-year" min="1" max="3" value="2" style="width:80px">
                        </div>
                    </div>

                    <div class="form-col">
                        <label>Minimalna ocena (0-10)</label>
                        <input type="number" id="vote-min" step="0.5" max="10" placeholder="np. 7.0">
                        <div class="weight-control">
                            <span class="weight-label">Waga:</span>
                            <input type="range" id="w-vote" min="1" max="3" value="2" style="width:80px">
                        </div>
                    </div>
                </div>

                <div class="form-group" style="margin-top:15px;">
                    <label>Gatunek (opcjonalnie)</label>
                    <select id="genre-select">
                        <option value="">-- Dowolny --</option>
                        <option value="28">Akcja</option>
                        <option value="35">Komedia</option>
                        <option value="18">Dramat</option>
                        <option value="878">Sci-Fi</option>
                        <option value="27">Horror</option>
                        <option value="10749">Romans</option>
                        <option value="53">Thriller</option>
                        <option value="16">Animacja</option>
                    </select>
                    <div class="weight-control">
                        <span class="weight-label">Waga:</span>
                        <input type="range" id="w-genre" min="1" max="3" value="2" style="width:80px">
                    </div>
                </div>
            </div>

            <button class="big-btn" onclick="generate()">Generuj Rekomendacje 🎲</button>
        </div>

        <div id="results-area"></div>
    </main>

    <script>
        // Przekazanie stanu logowania do JS (wymagane do przycisków i logiki ulubionych)
        const loggedIn = "{{ 'true' if request.session.get('session_id') else 'false' }}" === "true";

        // Logika przełączania widoku (czysty UI)
        function setMode(mode) {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            
            const adv = document.getElementById('advanced-panel');
            if (mode === 'advanced') adv.classList.remove('hidden');
            else adv.classList.add('hidden');
            
            window.currentMode = mode;
        }
        window.currentMode = 'quick'; // domyślnie
    </script>
    <script src="/static/recommendations.js"></script>
</body>
</html>
# myGeoChallenge 🌍

A free browser-based geography quiz game with 4 game modes, real-time multiplayer Versus, global leaderboards, and 35 unique rank titles. Play at **[mygeochallenge.com](https://mygeochallenge.com)** — no download or sign-up required.

---

## Play Online

👉 **[mygeochallenge.com](https://mygeochallenge.com)**

The game runs entirely in your browser. Guest play is available with no account needed.

---

## Game Modes

### 🧳 Suitcase Shuffle
Bags roll down the carousel — each one belongs to a different country. Match the correct flag to the right suitcase before time runs out. Flags are progressively unlocked as you answer correctly.

### 🗺️ Map Mayhem
A country silhouette appears on screen — identify it from the options given. Tests your visual recognition of country shapes from all continents.

### 🏙️ City Blitz
A city name flashes on screen — click it on the interactive world map. The faster you click, the bigger your speed bonus. Cities range from major capitals to lesser-known hidden gems, with difficulty unlocking progressively.

### 🏛️ Landmark Loco
Famous monuments and world wonders flash on screen. Identify the landmark and its country — from the Eiffel Tower to Angkor Wat.

---

## Features

- **World Tour Campaign** — Play all 4 modes back-to-back for a combined score and final rank reveal
- **Real-Time Versus** — Challenge friends or join public rooms with up to 10 players
- **Practice Tour** — Study by continent and difficulty at your own pace
- **Global Leaderboards** — High scores tracked per mode and overall
- **35 Rank Titles** — Progress from "Agoraphobic" to globe-trotting legend
- **Bilingual** — Full English and Spanish support, switchable at any time
- **Friend System** — Add friends, see their status, send match invitations
- **Profile & Stats** — Track play count, averages, and high scores per mode

---

## Scoring

- Each correct answer earns base points
- **Speed Bonus** — Answer quickly for extra points
- **Streak Bonus** — Consecutive correct answers multiply rewards
- Scores are saved to global leaderboards when signed in

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript (no frameworks)
- [Supabase](https://supabase.com) — Auth, database, real-time, and file storage
- Hosted on GitHub Pages with custom domain via Namecheap
- Google AdSense monetization (pending approval)

---

## Structure

```
/
├── index.html          # Landing page (mygeochallenge.com)
├── play.html           # The game
├── privacy.html        # Privacy policy
├── ads.txt             # AdSense verification
├── css/
│   └── style.css
├── js/
│   ├── game.js         # Mode 1 — Suitcase Shuffle (flags)
│   ├── shapes.js       # Mode 2 — Map Mayhem
│   ├── cities.js       # Mode 3 — City Blitz
│   ├── monuments.js    # Mode 4 — Landmark Loco
│   ├── i18n.js         # EN/ES translations
│   ├── friends.js      # Social / friends data layer
│   └── ...
└── images/
    ├── flags/
    ├── bg/
    └── characters/
```

---

## License

© 2026 myGeoChallenge — All rights reserved.

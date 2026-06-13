# Running PokéKart on Windows

PokéKart runs entirely in the browser — there's nothing platform-specific to
install beyond Node.js.

## 1. Install Node.js

Download and run the **LTS installer** (v22 or newer) from
[nodejs.org](https://nodejs.org) — it includes npm. Or install via winget:

```powershell
winget install OpenJS.NodeJS.LTS
```

Then open a **new** terminal and check it worked:

```powershell
node --version
npm --version
```

## 2. Get the project

**With git** — if you have git (or install it with `winget install Git.Git`,
then open a fresh terminal):

```powershell
git clone https://github.com/char-boomer-remakes/pokekart.git
```

**Without git** — on the [GitHub page](https://github.com/char-boomer-remakes/pokekart),
click the green **Code** button → **Download ZIP**, then right-click the
downloaded file → **Extract All**. No git required.

## 3. Install and run

In PowerShell (or Command Prompt), from the project folder:

```powershell
cd path\to\pokekart
npm install
npm run dev
```

Your browser opens to http://localhost:5173 automatically — that's the game.
Keep the terminal open while playing; press `Ctrl+C` in it to stop.

## Troubleshooting

- **`npm` is not recognized** — open a fresh terminal after installing Node
  (the PATH only updates in new windows).
- **Port 5173 in use** — Vite picks the next free port and prints the URL in
  the terminal; use that one.
- **Saved progress** — the Pokédex saves to the browser's `localStorage`, so
  always play in the same browser to keep your unlocks.

## Playing without the dev server (optional)

```powershell
npm run build
npm run preview
```

This builds the game into `dist/` and serves it at http://localhost:4173.
The `dist/` folder is plain static files, so you can also host it on any
static web server. (Don't double-click `dist/index.html` directly — browsers
block module scripts over `file://`.)

# AGAM 3D Solutions

## Run the website in VS Code

1. Open this project folder in VS Code.
2. Install Node.js 20 or newer if it is not already installed.
3. Open **Terminal → New Terminal** and run `npm start`.
4. Visit [http://localhost:8000](http://localhost:8000) in your browser.
5. Open **Keychain Maker** in the site navigation or visit [http://localhost:8000/keychain-maker.html](http://localhost:8000/keychain-maker.html).
6. Press **Ctrl+C** in the terminal to stop the server.

The keychain maker uses local HTML, CSS, JavaScript, and system fonts. It generates STL files entirely in your browser and does not send your text to a server. The first visit saves the maker page and its local assets so the page can be reopened offline from the same browser and origin.

## Keychain maker

The interactive maker is in `keychain-maker.html`; its styles, shared bitmap typeface, preview, and binary STL generator are in `assets/keychain-maker.css` and `assets/keychain-maker.js`. The offline cache is managed by `assets/keychain-service-worker.js`.

The standard design is a rounded 75 × 20 mm body, with a 3 mm base, 1.2 mm raised lettering, and a 5 mm through-hole 8 mm from the left edge. The displayed blue body and dark rim are visual guides; an STL stores geometry, not filament colors.

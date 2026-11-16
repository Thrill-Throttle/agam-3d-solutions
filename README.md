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

## Supabase setup

The storefront uses the browser-safe Supabase publishable key in `assets/agam-supabase.js`; a publishable key is intended to be visible to website visitors. Do not put a Supabase `service_role` key, database password, or other server secret in the website or this public repository.

1. In Supabase, open **SQL Editor**, paste in `supabase/setup.sql`, and run it. This creates the products, orders, and site-settings tables, seeds the sample products, creates the image buckets, and applies row-level security policies.
2. In **Authentication → URL Configuration**, set the site URL to `http://localhost:8000` for local testing. Add your production Render URL to the redirect URLs after deploying.
3. Use **Authentication → Users → Add user** or the website’s sign-up form to create your admin account with `akileshan2023@gmail.com`. Confirm that email before signing in to manage products and orders.
4. Email/password sign-in works through Supabase Auth. For Google sign-in, configure the Google provider under **Authentication → Sign In / Providers** with a Google OAuth client ID and client secret. In the Google Cloud OAuth client, authorize your local and deployed website origins as JavaScript origins, and add Supabase’s displayed callback URL as an authorized redirect URI. The client ID used by the website must match the one configured in Supabase.

Product catalog, product photos, payment QR, and orders are shared through Supabase. The shopping bag remains in the visitor’s browser until checkout. Order prices are calculated again in the database from the current product catalog.

## Publish the website

The `render.yaml` blueprint deploys the Node.js website server to Render. The repository does not include deployment credentials; connect the GitHub repository to Render and deploy the blueprint. Render generates `AGAM_SESSION_SECRET` for the existing server session API, and the server reads its public origin from `RENDER_EXTERNAL_URL`. After deployment, set the Render URL in Supabase’s authentication URL configuration.

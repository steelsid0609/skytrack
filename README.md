# SkyTrack

Personal Hypixel SkyBlock dashboard.

## Deploy

**Render API:** create Web Service from this repo, root directory `backend`, build `npm install && npm run build`, start `npm start`. Add `HYPIXEL_API_KEY` and `FRONTEND_ORIGIN` environment variables.

**Netlify UI:** base directory `frontend`, build `npm run build`, publish `dist`. Set `VITE_API_BASE_URL` to the Render service URL.

`render.yaml` provides a Render Blueprint. Never expose your Hypixel key in frontend variables or commit it.

Features in this first version: responsive dashboard, player/profile lookup, profile selector, available skills and purse/bank, live Bazaar search, and first-page BIN auction search. Historical charts and full net worth require database snapshots and are not fabricated yet.
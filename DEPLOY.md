# Deploying PocketPair (Vpsie / Ubuntu VPS)

PocketPair is a Flask app that serves the static frontend and a single
`/api/daily-puzzle` endpoint. In production it runs under **gunicorn**, behind
**nginx** (TLS + static files), managed by **systemd**.

## 1. Server prep

```bash
sudo apt update && sudo apt install -y python3-venv nginx
sudo mkdir -p /opt/pocketpair
sudo chown "$USER" /opt/pocketpair
```

## 2. Get the code + dependencies

```bash
cd /opt/pocketpair
git clone <your-repo-url> .          # or copy the files here
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

The service user (default `www-data`) must be able to **read** the app and
**read/write** `data/` (it writes `gameHistory.json` and a `.lock` file):

```bash
sudo chown -R www-data:www-data /opt/pocketpair/data
```

## 3. Smoke test before wiring anything up

```bash
./venv/bin/python tests/test_app.py
./venv/bin/gunicorn --bind 127.0.0.1:8000 server.app:app   # Ctrl-C to stop
```

## 4. systemd service

```bash
sudo cp deploy/pocketpair.service /etc/systemd/system/pocketpair.service
# Edit User/paths inside the unit if your layout differs.
sudo systemctl daemon-reload
sudo systemctl enable --now pocketpair
sudo systemctl status pocketpair
```

## 5. nginx

1. Add the rate-limit zone **once** to the `http {}` block of
   `/etc/nginx/nginx.conf`:

   ```nginx
   limit_req_zone $binary_remote_addr zone=pp_api:10m rate=10r/s;
   ```

2. Install the site and set your domain:

   ```bash
   sudo cp deploy/nginx-pocketpair.conf /etc/nginx/sites-available/pocketpair
   sudo sed -i 's/your-domain.com/REAL_DOMAIN/' /etc/nginx/sites-available/pocketpair
   sudo ln -s /etc/nginx/sites-available/pocketpair /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

## 6. TLS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d REAL_DOMAIN
```

Certbot rewrites the site to listen on 443 and redirect 80 → 443.

## 7. Updating / config

- Deploy new code: `git pull` then `sudo systemctl restart pocketpair`.
- `PORT` and `POCKETPAIR_CORS_ORIGINS` are set in the systemd unit. Leave CORS
  empty — the frontend is served same-origin, so no cross-origin is needed.
- Debug mode is always off; gunicorn (not the Flask dev server) runs in prod.

## Security notes

- Security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy) are set by
  the app on every response.
- nginx rate-limits `/api/`.
- No secrets are stored in the repo. `data/*.lock` and `__pycache__/` are
  gitignored.

# robfin.no

Personal website with live Discord presence and a private, database-backed content editor. The existing public design, English/Norwegian/Swedish translations, PC setup, hosting calculator, and 3D printing pages remain in place.

**Live website:** https://www.robfin.no
**Private editor:** http://10.0.0.87:8765

## Everyday editing

Open the editor from the home network or its Tailscale subnet route. There is no website password or account database: access is restricted to connections from **10.0.0.0/24**. Every permitted device on that subnet can edit. Use Tailscale ACLs and the LAN firewall to control who can reach the VM. Do not forward port 8765 to the internet or proxy it through the public website.

1. Select Homepage, PC setup, Hosting, or 3D printing.
2. **Page content** puts headings, descriptions, and service text first, with optional translations alongside each entry. Contact details, certificate details, images, and links have descriptive labels. Icons and section visibility are under **Appearance & section visibility**. **All translations** shows translations actually used by the page. Search finds matching fields.
3. **Experience** adds/removes/reorders roles and edits start/end dates and translated titles. Leave the end date empty for a current role.
4. **Hosting tiers** is the default Hosting view. Every tier has its own RAM, monthly price, and player estimate. Prices/RAM update all languages together; numeric player counts get localized labels, with optional translated estimates. Add/remove/reorder tiers; the public slider and RAM labels follow the list. **Available games** adds/removes/reorders games, descriptions, icons, and availability. These edit displayed offers, not provider billing.
5. **New cards** adds link cards, text cards, or homepage certificates. Upload PNG, JPEG, or WebP images up to 5 MB; set translated text and visibility, reorder, or remove entries. Certificates appear in Certifications; other new cards appear above the footer. Existing cards remain editable under Page content/Translations.
6. **Save draft** stores edits privately. **Preview draft** saves unsaved edits and opens an isolated preview. **Publish changes** makes all four pages live together without a Git push, restart, or deployment.
7. **Version history** restores a published version into the draft for review. Discard draft changes restores the current published content.

Drafts are never served by the public website. Uploaded images are public assets once uploaded: do not upload confidential files. Preview uses live external assets and suppresses the live Discord connection. New card and experience translations fall back to English; existing translations are independent.

**PC specs & page text** edits current components with clear field names. **Upgrade plans** is a priority-ordered list with any number of plans. Each has a title, description, optional estimated cost, and its own add/remove/reorder list of product links. Public step numbering follows the saved order. Existing upgrade/game entries migrate from their saved fields and translations, preserving current edits and URLs.

The editor does not accept arbitrary HTML, JavaScript, CSS, SQL, commands, or server configuration. New layout types require code changes.

## Technology and architecture

| Technology | Purpose |
| --- | --- |
| Node.js + Express | Public website and published-page middleware |
| discord.js + Socket.IO | Discord presence and immediate updates to browsers |
| Python 3.12 standard library | Separate private editor service; no additional Python packages |
| SQLite | Persistent structured draft/published content, revision counter, and published history |
| HTML/CSS/vanilla JavaScript | Responsive admin forms, images, translations, preview, and publish |
| HTML templates | Existing site appearance with escaped database content |
| Docker (`node:20-bullseye`) | Public `discord-status` container, running as UID/GID 1000 with read-only source/published-content mounts |
| PM2 | Private editor supervision and restart after reboot |
| NGINX Proxy Manager + existing TLS | Public domain forwards to `discord-status:3000` on Docker network `npm_default`; no admin proxy |
| GitHub Actions + SSH + rsync | Tests, code backups, deployment, and service restarts |
| Existing Tailscale subnet routing | Private remote access to the VM's LAN address |

Publishing renders all four pages into a new version folder, then atomically changes a `CURRENT` pointer. Express serves that published snapshot before fallback static HTML. The public website continues serving the published content if the private editor stops. Publishing does not restart Discord or Node.

The Discord integration and website share one HTTP server in Docker. `index.js` owns HTTP and Socket.IO; `server.js` remains a compatibility entry point for local use. The duplicate legacy PM2 website process is removed to avoid running the bot twice. NGINX Proxy Manager's public host settings and CaseBoard location remain unchanged.

The public container can read only the source, published snapshots, and uploaded public images. Its mounts do not include the SQLite database, draft content, or backups. It runs `node index.js` without installing dependencies as root. Dependency installation happens on the host during deployment, avoiding the old root-owned `node_modules` problem.

## Files and storage

```text
discord-live-status/
  index.js                        # HTTP server, Discord bot, Socket.IO
  server.js                       # Compatibility entry point for local use
  public/                         # Public assets and fallback HTML
  cms/
    server.py                     # Private HTTP API, SQLite, validation, rendering
    sections.py                   # Upgrade/game collections, migration, and editor schema
    admin/                        # Admin HTML/CSS/JS
    templates/                    # Authoritative layouts for managed pages
    seed/content.json             # Initial public content and editable-field schema
    public-middleware.js          # Published HTML and uploaded public images
    public-client.js              # Aligns hosting slider with editable tiers
    ecosystem.config.cjs          # Editor PM2 configuration
    docker-compose.site.yml       # Public container recovery/reference configuration
    site.ecosystem.config.cjs      # Empty compatibility file; website is in Docker
    deploy.sh                     # Initialize, rebuild snapshots, restart, health check
    test_backend.py               # HTTP, database, validation, and access tests
```

Production data lives **outside the Git/deployment tree**:

```text
/home/robfin/.local/share/robfin-cms/
  content.sqlite3                 # Never commit this database
  backups/                        # Last 30 automatic SQLite backups
  uploads/                        # Public images, preserved across deployments
  published/
    CURRENT                       # Current version pointer
    <version>/*.html              # Published snapshots
```

Code deployment backups live under `/home/robfin/.local/share/robfin-deploy-backups/`. Those private archives may contain `.env`; never upload them to GitHub. VM-local backups support rollback but do not protect against losing the VM. Include the full content directory in Proxmox/off-machine backups.

## Editing code in GitHub

Pushing `main` still auto-deploys. The workflow tests the editor, stages source outside the live folder, backs up existing code, preserves `.env` and persistent content, installs Node dependencies, synchronizes source, renders the saved database using the current templates, restarts the public Docker container and private PM2 editor, and health-checks the actual Docker upstream through NGINX Proxy Manager. CaseBoard retains its separate deployment step.

**Edit `cms/templates/*.html` to change the managed site's layout.** The old `public/*/index.html` files are fallback pages; their text does not override SQLite. Existing placeholder IDs must remain stable. Change content using the editor; change CSS, markup, and behavior in templates/source.

`seed/content.json` initializes an empty database and defines editable fields. Updated defaults do **not** replace existing saved content. To add a field, add a new stable ID to the page's seed `fields` and a matching `@@FIELD_f123@@` placeholder to its template. Never renumber existing IDs. Add new translation keys to each language in the seed schema. Deployment adds missing fields/translation keys while preserving existing values. Renaming/removing fields or changing types requires a deliberate migration.

Other markers: `@@CMS_translations@@`, `@@CMS_positions@@`, `@@CMS_tierData@@`, `@@EXTRA_CARDS@@`, and `@@EXTRA_CERTIFICATES@@`. Templates/schema are trusted source; editor values are validated and escaped for HTML/JSON contexts before rendering. Do not regenerate field IDs from arbitrary new HTML over an existing database.

## Setup and operations

Requirements: compatible host Node.js/npm, Python 3.12+, PM2, rsync, Docker access for `robfin`, and the existing NGINX Proxy Manager/TLS setup. The public container uses the installed Node 20 image. Run as `robfin`:

```bash
cd /home/robfin/Homepage/discord-live-status
npm ci --omit=dev
bash cms/deploy.sh
pm2 list
docker ps
```

`cms/docker-compose.site.yml` records the public container definition for recovery. The live container is already configured; do not start a second copy with the same name. For recreation, first retain/rename the old `discord-status` container, then use the reference Compose definition. Keep the existing `npm_default` Docker network and NPM host pointing at `discord-status:3000`. Original container configuration is backed up privately under the deployment-backups directory; it can contain environment secrets and must stay off GitHub.

One-time Ubuntu firewall rule (enter the Ubuntu password locally):

```bash
sudo ufw allow from 10.0.0.0/24 to 10.0.0.87 port 8765 proto tcp
```

Do not use an unrestricted `ufw allow 8765`. No public NGINX route or router port-forward is needed.

The editor binds only `10.0.0.87:8765`. It checks the actual TCP peer address, exact Host, same-origin writes, browser cross-site request metadata, and an automatic per-process CSRF token. Forwarded IP headers are ignored. The token is not a stored login/password. The public Express app exposes no editor writes or database files. The admin has a restrictive content security policy; preview runs in an isolated sandboxed iframe.

`CMS_DATA_DIR`, `CMS_BIND`, and `CMS_PORT` are configurable. If changing the LAN IP/subnet, update the access checks, PM2 config, health check, and README together. Admin traffic uses HTTP on the private network: Tailscale encrypts its routed link; plain LAN traffic is not TLS-encrypted.

For local development:

```bash
CMS_DATA_DIR=/tmp/robfin-cms-dev CMS_BIND=127.0.0.1 python3 cms/server.py
# Open http://127.0.0.1:8765
python3 cms/test_backend.py
```

### Backups and recovery

There are 30 automatic SQLite backups before content writes and a history of published versions. **Download database backup** produces a consistent SQLite snapshot; **Export content** downloads the current draft as JSON for inspection/portability. The UI does not import arbitrary JSON. Back up `uploads/` separately or copy the complete content directory.

For routine undo, use Version history. For disaster recovery: stop `robfin-editor`, copy the existing content directory somewhere safe, replace `content.sqlite3` with the selected backup, remove stale `content.sqlite3-wal`/`content.sqlite3-shm` only while the editor is stopped, and run `bash cms/deploy.sh`. Startup rebuilds published HTML from the restored database. Restore images alongside the database.

Roll back code using Git or a private deployment archive, preserve content storage, and rerun deployment. A rollback across schema changes needs a compatible database backup.

## Discord and secrets

Keep the existing server-only `discord-live-status/.env`:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_USER_ID=your_user_id
```

Enable the intents used by `index.js` in Discord's developer portal and keep the bot in a server with the tracked user. Existing GitHub Actions secret `SERVER_SSH_KEY` remains the deployment credential. Never commit `.env`, SSH private keys, database files, backups, or live uploads. `.gitignore` excludes common secret/database files; also review staged files.

## Validation

`python3 cms/test_backend.py` covers rendering, draft isolation, publishing/restoring, restart persistence, stale revision conflicts, unsafe URLs, script escaping, invalid dates/uploads, request tokens/origins/Host/peer checks, upgrade/link/game collections, all-tier rendering, and migration of existing edits. Browser tests exercised adding/reordering upgrades with multiple links, every price/player field, new games, desktop/mobile layouts, and all 21 combinations of seven hosting tiers and three languages. After production changes, check all four public pages, language controls, hosting slider, Discord updates, private access, and GitHub Actions.

## License

MIT; see [LICENSE](LICENSE).

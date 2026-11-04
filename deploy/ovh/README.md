# Putting Granville's Coffee on an OVH VPS

This sets up the website, the admin portal and the database on one OVH VPS. It takes about 15 minutes, most of it
waiting. You need: an OVH VPS (the smallest VPS plan is enough), and optionally the café's domain name.

## 1. Order the VPS

In the OVHcloud Control Panel, order a **VPS** and choose **Ubuntu 24.04** as the operating system. OVH emails you
the server's IP address and a login (usually user `ubuntu`).

> OVH's shared "Web Hosting" plans can't run this app, because it needs Node.js and PostgreSQL running all the time.
> Pick a VPS.

## 2. Point the domain at the server (optional, but needed for HTTPS)

Where the domain is managed (OVH: *Web Cloud → Domain names → your domain → DNS zone*), set:

| Type | Name | Value |
|---|---|---|
| A | *(blank, the bare domain)* | your VPS IP |
| A | `www` | your VPS IP |

DNS changes can take from a few minutes to a few hours. You can do step 3 straight away and add HTTPS later.

## 3. Run the installer

Connect to the server (on Windows use PowerShell, on Mac use Terminal):

```bash
ssh ubuntu@YOUR_VPS_IP
```

Then paste these two lines, with your own domain and email:

```bash
curl -fsSL https://raw.githubusercontent.com/Electtech-ca/Granville-s-Coffee/claude/project-thread-2lig8f/deploy/ovh/install.sh -o install.sh
sudo DOMAIN=granvillescoffee.ca EMAIL=you@example.com bash install.sh
```

No domain yet? Run `sudo bash install.sh` instead; the site will be at `http://YOUR_VPS_IP/`. Run the command again
with `DOMAIN=` and `EMAIL=` later to switch on HTTPS. Running it again never loses data.

When it finishes it prints the website address, the admin address and a **setup code**.

## 4. Create the owner login

Open `https://your-domain/admin/` (or `http://YOUR_VPS_IP/admin/`), enter your name, email, a password of 10 or more
characters, and the setup code. You're in. Invite managers and staff from **Settings**.

To try it with sample numbers first, use **Settings → Load sample data**, and **Remove sample data** when you're done.

## Everyday tasks

| To… | Run on the server |
|---|---|
| Update to the latest version from GitHub | `sudo granvilles-update` (backs up first) |
| Turn on the AI assistant | `sudo nano /etc/granvilles/granvilles.env`, paste the key after `ANTHROPIC_API_KEY=`, save, then `sudo systemctl restart granvilles` |
| Make a backup now | `sudo granvilles-backup` (nightly backups run at 3:15 a.m., 14 days kept, in `/var/backups/granvilles`) |
| Restore a backup | `sudo -u postgres pg_restore --clean --if-exists -d granvilles /var/backups/granvilles/FILE.dump` |
| See what the app is doing | `sudo journalctl -u granvilles -f` |
| Restart the app | `sudo systemctl restart granvilles` |

Backups stay on the same server. For safety, copy them somewhere else now and then, or turn on OVH's automated
VPS backup option.

## What the installer sets up

- Node.js 22, PostgreSQL, nginx, Let's Encrypt HTTPS with automatic renewal (when DOMAIN and EMAIL are given)
- A `granvilles` system user that runs the app, with the code in `/opt/granvilles/app`
- A database with a random password, and settings in `/etc/granvilles/granvilles.env` (readable only by root and the app)
- A systemd service that starts on boot and restarts the app if it ever stops
- A firewall that allows only SSH, HTTP and HTTPS (skip with `FIREWALL=no`)
- Nightly database backups (photos uploaded in the admin are in the database, so they're included)

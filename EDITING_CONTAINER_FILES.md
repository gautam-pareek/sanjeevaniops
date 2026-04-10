# Editing Files Inside a Docker Container

When the Recovery Playbook identifies a file to fix (e.g. `checkout.html`, `nginx.conf`, `app.js`),
use the steps below to open and edit it inside the running container.

---

## Option 1 — Docker Desktop GUI (easiest)

1. Open **Docker Desktop** → click the container → go to the **Files** tab
2. Navigate the file tree to the path shown in the playbook
   - For nginx containers: `usr → share → nginx → html → checkout.html`
   - For node/python apps: `app → <filename>`
3. Click the file to view its contents
4. To edit: use the **Terminal** tab at the bottom right to open a shell inside the container, then edit with `vi <path>`

---

---

## Step 1 — Find the file path

```bash
docker exec <container_name> find / -name "<filename>" 2>/dev/null
```

**Example:**
```bash
docker exec testsite2-container find / -name "checkout.html" 2>/dev/null
# → /usr/share/nginx/html/checkout.html
```

---

## Step 2 — View the file

```bash
docker exec <container_name> cat <full_path>
```

**Example:**
```bash
docker exec testsite2-container cat /usr/share/nginx/html/checkout.html
```

---

## Step 3 — Edit the file

### Option A: Copy out → edit locally → copy back (recommended)

```bash
# 1. Copy the file out of the container
docker cp <container_name>:<full_path> ./<filename>

# 2. Edit it with any editor (VS Code, Notepad, vim, etc.)
code ./<filename>

# 3. Copy the fixed file back into the container
docker cp ./<filename> <container_name>:<full_path>
```

**Example:**
```bash
docker cp testsite2-container:/usr/share/nginx/html/checkout.html ./checkout.html
# edit checkout.html ...
docker cp ./checkout.html testsite2-container:/usr/share/nginx/html/checkout.html
```

### Option B: Edit directly inside the container (if vi/nano is available)

```bash
docker exec -it <container_name> vi <full_path>
# or
docker exec -it <container_name> nano <full_path>
```

**Example:**
```bash
docker exec -it testsite2-container vi /usr/share/nginx/html/checkout.html
```

### Option C: Overwrite with a single command (for small changes)

```bash
docker exec <container_name> sh -c 'echo "new content" > <full_path>'
```

---

## Step 4 — Verify the fix

After editing, run the quick verify command from the Recovery Playbook.
For a body keyword issue:

```bash
curl -s http://localhost:<port>/<path> | grep -i 'error\|exception\|traceback' || echo "Health check passed"
```

**Example:**
```bash
curl -s http://localhost:8086/checkout.html | grep -i 'error' || echo "Health check passed"
```

---

## Step 5 — Permanent fix

Editing a file inside a running container is **temporary** — it will revert if the container is
rebuilt or restarted. To make the fix permanent:

1. Edit the source file in your project directory
2. Rebuild the image: `docker build -t <image_name> .`
3. Restart the container: `docker stop <container_name> && docker run ...`

---

## Common file locations by container type

| Container type | Static files | Config |
|----------------|-------------|--------|
| nginx | `/usr/share/nginx/html/` | `/etc/nginx/nginx.conf` |
| apache | `/var/www/html/` | `/etc/apache2/apache2.conf` |
| node | `/app/` or `/usr/src/app/` | `/app/.env` |
| python | `/app/` or `/code/` | `/app/.env` |

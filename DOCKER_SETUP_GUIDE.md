# Docker Setup Guide — Containerising and Registering an App on SanjeevaniOps

This guide walks through taking any web project (or the included test site),
packaging it as a Docker container, running it locally, and registering it
on SanjeevaniOps for full monitoring.

---

## Part 1 — Containerise your web app

### Step 1: Add a Dockerfile

Place a file named `Dockerfile` (no extension) in your project root.
For any static HTML/CSS/JS site, use this:

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

For a Python Flask/FastAPI app:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

For a Node.js app:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

### Step 2: Add a .dockerignore

Create `.dockerignore` in your project root to exclude junk from the image:

```
node_modules
__pycache__
*.pyc
.git
.env
Dockerfile
.dockerignore
```

### Step 3: Build the image

Open a terminal in your project folder and run:

```powershell
docker build -t my-app-name .
```

- `-t my-app-name` — the image tag (name). Use lowercase letters and hyphens only.
- `.` — build context is the current folder.

You should see Docker pulling the base image and running each step. A successful
build ends with something like:

```
Successfully built a1b2c3d4e5f6
Successfully tagged my-app-name:latest
```

### Step 4: Run the container

```powershell
docker run -d --name my-app-container -p 8080:80 my-app-name
```

- `-d` — detached mode (runs in background)
- `--name my-app-container` — container name (used by SanjeevaniOps)
- `-p 8080:80` — maps port 8080 on your machine to port 80 inside the container
- `my-app-name` — the image tag from Step 3

Verify it is running:

```powershell
docker ps
```

You should see `my-app-container` in the list with status `Up`.

Open your browser and visit: `http://localhost:8080`

### Step 5: Test it manually

Check each route works:

```powershell
curl http://localhost:8080/
curl http://localhost:8080/help.html
curl http://localhost:8080/settings.html
```

If a route returns a 500 or is broken, SanjeevaniOps will catch it after
you register and configure health checks.

---

## Part 2 — For the included test site

The `testsite/` folder already contains a ready-to-use example with 3 pages:
- `/` — homepage (healthy, returns 200)
- `/help.html` — help page (healthy, returns 200)
- `/settings.html` — broken page (returns 200 but shows a 500 error body — used to test keyword detection)

```powershell
cd testsite
docker build -t testsite .
docker run -d --name testsite-container -p 8080:80 testsite
```

Visit `http://localhost:8080` to confirm it is running.

---

## Part 3 — Register the container on SanjeevaniOps

Make sure SanjeevaniOps is running:

```powershell
cd sanjeevaniops
python -m backend.api.main
```

Then open the dashboard: `dashboard/index.html` in your browser.

### Step 1: Open the registration wizard

Click the `+ Register Application` button on the dashboard.

### Step 2: Basic info (Step 1 of 4)

| Field | Value for test site |
|-------|-------------------|
| Application Name | Test Site |
| Description | 3-page test site with a broken settings route |
| Environment | development |
| Container Name | `testsite-container` |

The container name must exactly match the `--name` you used in `docker run`.

### Step 3: Health check config (Step 2 of 4)

| Field | Value |
|-------|-------|
| Check Type | HTTP |
| URL | `http://localhost:8080/` |
| Method | GET |
| Expected Status Codes | `200` |
| Interval | 30 seconds |
| Timeout | 5 seconds |
| Failure Threshold | 2 |
| Success Threshold | 1 |

**Enhanced detection settings:**

| Field | Value | Why |
|-------|-------|-----|
| Warn response time | `2000` ms | Warn if homepage takes over 2s |
| Critical response time | `4000` ms | Critical if over 4s |
| Additional endpoints | `/help.html` | Verify help page is reachable |
| Error keywords | `Internal Server Error, TypeError, traceback` | Catch the broken settings page content |
| Expect JSON | unchecked | This is an HTML site |

> Note: The settings page returns HTTP 200 but contains error text.
> The keyword detection check will catch this if you add `/settings.html`
> as an additional endpoint.

### Step 4: Recovery policy (Step 3 of 4)

| Field | Value |
|-------|-------|
| Max retries | 3 |
| Retry delay | 10 seconds |
| Failure action | notify |
| Auto restart | disabled (human approval required) |

### Step 5: Review and submit (Step 4 of 4)

Review your configuration and click `Register Application`.

SanjeevaniOps will:
1. Verify the container exists in Docker
2. Save your health check configuration
3. Start a background monitoring job
4. Run the first health check within 30 seconds

---

## Part 4 — Verifying monitoring is working

On the dashboard, find your registered app. Within one check interval you
should see:

- **Monitoring** badge — background job is running
- **Healthy** status — homepage responding correctly
- Health history table — first check result with sub-check breakdown

Click `Run Check Now` to trigger an immediate check without waiting.

### What the sub-checks will show for the test site

| Sub-check | Homepage `/` | Help `/help.html` | Settings `/settings.html` |
|-----------|-------------|-------------------|--------------------------|
| HTTP Status | ✅ 200 | ✅ 200 | ✅ 200 (misleading!) |
| Response Time | ✅ fast | ✅ fast | ✅ fast |
| Body Keywords | ✅ none found | ✅ none found | ❌ "Internal Server Error" found |
| Restart Count | ✅ stable | — | — |

This demonstrates exactly why keyword detection matters — the settings page
returns 200 but is broken. SanjeevaniOps catches it.

---

## Part 5 — Stopping and restarting the container

Stop the container (simulates a crash):

```powershell
docker stop testsite-container
```

SanjeevaniOps will detect this on the next check interval and mark the app
as **Unhealthy** immediately (container exited = instant unhealthy, no
threshold wait).

Restart it:

```powershell
docker start testsite-container
```

SanjeevaniOps will mark it **Healthy** again after 1 successful check
(success_threshold = 1).

---

## Useful Docker commands

```powershell
docker ps                          # list running containers
docker ps -a                       # list all containers including stopped
docker logs testsite-container     # view container logs
docker stop testsite-container     # stop container
docker start testsite-container    # start stopped container
docker restart testsite-container  # restart container
docker rm testsite-container       # remove container (must be stopped)
docker rmi testsite                # remove image
docker stats testsite-container    # live CPU/memory usage
```

---

## Troubleshooting

**Container not found in SanjeevaniOps verify step**
- Check that Docker Desktop is running
- Check the container name matches exactly: `docker ps --format "{{.Names}}"`

**Health check shows "connection refused"**
- The container might be stopped: `docker ps`
- The port mapping might be wrong: `docker port testsite-container`

**Settings page shows healthy when it should be unhealthy**
- Make sure you added `/settings.html` to the additional endpoints list
- Make sure `Internal Server Error` is in your error keywords list

**SanjeevaniOps not starting**
- Make sure you are in the `sanjeevaniops/` directory
- Run `pip install -r requirements.txt` first

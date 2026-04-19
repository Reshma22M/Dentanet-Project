# DentaNet Backend (Node + MySQL)

## Quick Setup

```powershell
cd backend
copy .env.example .env
npm install
```

Update `.env` values:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
- `PORT` (default: `3002`)
- `DED_API_URL` (default: `http://127.0.0.1:8000/predict/`)

## Database Import

From project root:

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS dentanet_lms;"
mysql -u root -p dentanet_lms < backend/database/schema2.sql
```

Optional sample users:

```powershell
mysql -u root -p dentanet_lms < backend/database/insert_test_users2.sql
```

## Run

```powershell
cd backend
npm run dev
```

## Health Endpoints

- `GET /api/health`
- `GET /api/health/db`

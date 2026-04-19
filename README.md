# DentaNet LMS

Brief summary:
DentaNet is a role-based LMS for dental practical training and assessment.
Students book practice/exam slots, submit practical work, receive AI + lecturer evaluation, and view module-scoped results.
Lecturers manage exams, review submissions, publish results, and generate analytics reports.
Admins manage users, modules, and slot approvals.

## How The System Works

1. Student books a slot (`PRACTICE` or `EXAM`) from module context.
2. Admin approves slot and machine allocation.
3. Student submits practical images for that booked slot.
4. Backend calls DEd AI API (`/predict/`) for auto-evaluation.
5. Lecturer reviews and finalizes/publishes results.
6. Student sees submission/result status per module.
7. Lecturer report page shows batch performance + AI accuracy charts.

## Tech Stack

- Frontend: Static HTML + Tailwind + JS (`frontend/`)
- Main Backend: Node.js + Express + MySQL (`backend/`)
- AI Backend: FastAPI + TensorFlow model (`DEd/backend/`)

## Project Structure

- `backend/` -> Node API + MySQL integration
- `backend/database/schema2.sql` -> database schema
- `backend/database/insert_test_users2.sql` -> optional sample data
- `DEd/backend/` -> FastAPI AI evaluation service
- `frontend/` -> static web UI

## Prerequisites

- MySQL 8+
- Node.js 18+
- Python 3.10+ (for DEd backend)

## 1) Database Setup

Create DB and import schema:

```powershell
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS dentanet_lms;"
mysql -u root -p dentanet_lms < backend/database/schema2.sql
```

Optional test data:

```powershell
mysql -u root -p dentanet_lms < backend/database/insert_test_users2.sql
```

## 2) Main Backend Setup (Node.js)

```powershell
cd backend
copy .env.example .env
npm install
```

Update `backend/.env` values at minimum:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`
- `PORT` (default is `3002`)
- `DED_API_URL` (default: `http://127.0.0.1:8000/predict/`)

Run backend:

```powershell
cd backend
npm run dev
```

Health checks:

- `http://localhost:3002/api/health`
- `http://localhost:3002/api/health/db`

## 3) DEd Backend Setup (FastAPI + TensorFlow)

From project root:

```powershell
cd DEd/backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install fastapi uvicorn tensorflow pillow numpy opencv-python python-multipart
```

Run DEd API:

```powershell
cd DEd/backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000
```

Test:

- `http://127.0.0.1:8000/`

Note:
Model file should exist at `DEd/backend/model/last_train_model.keras`.

## 4) Frontend Setup (Static)

This frontend is static HTML (no Node build step required).

```powershell
cd frontend
python -m http.server 8080
```

Open:

- `http://localhost:8080/login.html`

## Recommended Startup Order

1. Start MySQL
2. Start DEd backend on `8000`
3. Start Node backend on `3002`
4. Start frontend on `8080`

## Notes

- If API URL is customized, set `localStorage.DENTANET_API_BASE_URL` or update environment/config accordingly.
- If CORS or connection issues happen, confirm backend port and `FRONTEND_URL` in `.env`.

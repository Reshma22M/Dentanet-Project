# DentaNet System Test Checklist

Use this checklist once before the demo to avoid surprises.

## A. Startup Verification

1. Start MySQL.
2. Start DEd backend (`DEd/backend`) on port `8000`.
3. Start Node backend (`backend`) on port `3002`.
4. Start frontend static server (`frontend`) on port `8080`.

Expected:
- `http://localhost:3002/api/health` returns OK.
- `http://localhost:3002/api/health/db` returns DB OK.
- `http://127.0.0.1:8000/` returns FastAPI running.
- `http://localhost:8080/login.html` opens.

## B. Authentication & Role Routing

1. Login as student -> lands on student pages.
2. Login as lecturer -> lands on lecturer pages.
3. Login as admin -> lands on admin pages.
4. Logout works and returns to login.

## C. Lab Slot Booking Flow

### Practice booking
1. Open module -> Lab Slot Booking -> Practice tab.
2. Select date + custom start/end time.
3. Try invalid range (`end <= start`) -> should show validation warning.
4. Submit valid range -> booking request created.
5. Booking appears in "My Practice Sessions".

### Exam booking
1. Open module -> Exam tab.
2. Book available exam slot.
3. Slot request appears with correct status.

## D. Admin Approval Flow

1. Open pending bookings.
2. Approve one practice request and one exam request.
3. Assign machine/resource where required.
4. Confirm status updates are visible to student.

## E. Submission Flow

### Practice
1. Open Submission Hub -> Practice.
2. Click Submit Now for approved booking.
3. Upload images and submit.
4. Return to hub: button changes to View Results.

### Exam
1. Open Submission Hub -> Exam.
2. Submit for approved exam slot.
3. Confirm duplicate same-slot submission is blocked.

## F. Result Visibility

1. Open results from module context.
2. Confirm only that module's results are shown.
3. Verify submitted practice shows View Results in module details + hub.

## G. Lecturer Evaluation & Report

1. Lecturer opens submissions list.
2. Reviews/publishes at least one result.
3. Open reports page and generate:
   - Batch performance report
   - AI accuracy report
4. Export CSV and Download Report (print view) for both tabs.

## H. Regression Checks (Recent Fixes)

1. No blinking/redirect loop from Practice Submit Now.
2. Practice submit link carries correct context (`module_id`, `submission_type=PRACTICE`).
3. Report page shows only intended batch charts (bottom 2 removed).

---

# Automated Smoke Tests Run (This Session)

The following were executed and passed:

1. `node --check backend/routes/bookings.js` -> PASS
2. `node --check backend/routes/submissions.js` -> PASS
3. Inline script parse check:
   - `frontend/lab-slot-booking.html` -> PASS
   - `frontend/lecturer-reports.html` -> PASS
4. Backend live smoke:
   - `/api/health` -> PASS
   - `/api/health/db` -> PASS
5. DEd live smoke:
   - `http://127.0.0.1:8000/` -> PASS
6. Frontend live smoke:
   - `http://127.0.0.1:8080/login.html` -> PASS

---

# Demo Day Quick Recovery Plan

If something fails during presentation:

1. Restart in order: MySQL -> DEd -> Node backend -> frontend static server.
2. Hard refresh browser (`Ctrl + F5`).
3. Re-login and continue from prepared module/use-case.
4. Keep one fallback line:
   - "The workflow logic is validated at API and DB level; I will continue with the next step while this view refreshes."

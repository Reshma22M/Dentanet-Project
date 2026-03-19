# DentaNet LMS - Database Integration Guide

## 📋 Prerequisites

1. **MySQL Server** (8.0 or higher)
2. **Node.js** (v18 or higher) - for backend
3. **npm** or **yarn** - package manager

## 🗄️ Step 1: MySQL Database Setup

### Install MySQL
- **Windows**: Download from https://dev.mysql.com/downloads/mysql/
- **Mac**: `brew install mysql`
- **Linux**: `sudo apt-get install mysql-server`

### Start MySQL Server
```bash
# Windows
net start MySQL

# Mac/Linux
sudo systemctl start mysql
# or
mysql.server start
```

### Create Database
```bash
# Login to MySQL
mysql -u root -p

# Run the schema file
source C:/Users/USER/Downloads/DentaNet-new/backend/database/schema.sql

# Or create manually:
CREATE DATABASE dentanet_lms;
USE dentanet_lms;
```

## 🚀 Step 2: Backend Setup (Node.js + Express)

### Install Backend Dependencies
```bash
cd C:/Users/USER/Downloads/DentaNet-new/backend
npm init -y

# Install required packages
npm install express mysql2 dotenv bcrypt jsonwebtoken cors body-parser multer
npm install --save-dev nodemon
```

### Package Explanation:
- **express**: Web framework
- **mysql2**: MySQL database driver
- **dotenv**: Environment variables
- **bcrypt**: Password hashing
- **jsonwebtoken**: Authentication tokens
- **cors**: Cross-origin resource sharing
- **body-parser**: Parse JSON requests
- **multer**: File upload handling
- **nodemon**: Auto-restart during development

## 🔐 Step 3: Environment Configuration

Create `.env` file in backend folder with your database credentials.

## 🔌 Step 4: Database Connection

The database connection pool is configured in `config/database.js`.

## 📡 Step 5: API Endpoints Structure

### Authentication Routes:
- POST `/api/auth/login` - User login
- POST `/api/auth/register` - User registration
- POST `/api/auth/logout` - User logout
- GET `/api/auth/verify` - Verify JWT token

### User Routes:
- GET `/api/users` - Get all users (admin)
- GET `/api/users/:id` - Get user by ID
- PUT `/api/users/:id` - Update user
- DELETE `/api/users/:id` - Delete user

### Lab Booking Routes:
- GET `/api/bookings` - Get all bookings
- POST `/api/bookings` - Create new booking
- PUT `/api/bookings/:id` - Update booking status
- DELETE `/api/bookings/:id` - Cancel booking

### Exam Submission Routes:
- POST `/api/submissions` - Submit exam
- GET `/api/submissions/:id` - Get submission details
- POST `/api/submissions/:id/images` - Upload images

### Evaluation Routes:
- POST `/api/evaluations/ai` - AI evaluation
- POST `/api/evaluations/lecturer` - Lecturer evaluation
- GET `/api/evaluations/:submissionId` - Get evaluation

### Study Materials Routes:
- GET `/api/materials` - Get all materials
- POST `/api/materials` - Upload material
- DELETE `/api/materials/:id` - Delete material

### Notification Routes:
- GET `/api/notifications/:userId` - Get user notifications
- PUT `/api/notifications/:id/read` - Mark as read

## 🔄 Step 6: Frontend Integration

Update frontend JavaScript to call API endpoints instead of using local data.

Example API call:
```javascript
// Login
async function login(email, password) {
    const response = await fetch('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        // Redirect based on role
        window.location.href = data.user.role + '-dashboard.html';
    }
}
```

## 🏃‍♂️ Step 7: Run the Application

### Start Backend Server:
```bash
cd backend
npm run dev
```

### Open Frontend:
Simply open `frontend/login.html` in your browser or use a local server:
```bash
cd frontend
# Python 3
python -m http.server 8080

# Node.js
npx http-server -p 8080
```

### Access:
- Frontend: http://localhost:8080
- Backend API: http://localhost:3000

## 🧪 Step 8: Testing

### Test Database Connection:
```bash
node backend/config/database.js
```

### Test API Endpoints:
Use Postman or curl:
```bash
# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@dentanet.ac.lk","password":"admin123"}'
```

## 📊 Step 9: Database Backup

```bash
# Backup
mysqldump -u root -p dentanet_lms > backup.sql

# Restore
mysql -u root -p dentanet_lms < backup.sql
```

## 🔒 Security Best Practices

1. **Never commit `.env` file** to version control
2. **Use prepared statements** to prevent SQL injection
3. **Hash all passwords** with bcrypt
4. **Use HTTPS** in production
5. **Validate all inputs** on both frontend and backend
6. **Implement rate limiting** to prevent abuse
7. **Use JWT tokens** with expiration
8. **Enable CORS** only for trusted domains

## 📱 Next Steps

1. Run `schema.sql` to create database
2. Configure `.env` with your credentials
3. Install npm packages
4. Start backend server
5. Update frontend API calls
6. Test login and basic features
7. Deploy to production server

## 🆘 Troubleshooting

### Connection Error:
- Check MySQL is running: `mysql -u root -p`
- Verify credentials in `.env`
- Check port 3306 is not blocked

### CORS Error:
- Ensure CORS is enabled in `server.js`
- Check frontend URL is allowed

### Authentication Error:
- Clear browser cache and localStorage
- Verify JWT secret in `.env`
- Check token expiration

## 📚 Resources

- MySQL Documentation: https://dev.mysql.com/doc/
- Express.js: https://expressjs.com/
- JWT: https://jwt.io/
- Bcrypt: https://www.npmjs.com/package/bcrypt

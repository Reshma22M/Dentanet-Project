# DentaNet Frontend Structure

## File Organization

### Pages
- **login.html** - Role-based login page with dropdown to select Student/Lecturer/Admin
- **signup.html** - Role-based signup page for new user registration
- **reset-password.html** - Password reset page (role-agnostic)

### Assets
- **public/images/** - Images used by the frontend
- **public/css/styles.css** - External stylesheet for custom styles
- **assets/js/** - Shared frontend JavaScript modules and page scripts

## User Roles

### 1. Student
- Can register and login via the student role option
- Access to student-specific dashboard and features

### 2. Lecturer / Consultant
- Can register and login via the lecturer role option
- Access to lecturer-specific dashboard and course management

### 3. Administrator
- Can register and login via the admin role option
- Access to admin dashboard and system management

## Page Linking
- Login page <-> Signup page
- Login page -> Reset Password page
- Navigation and role flows are handled by page-level markup and shared JS utilities

## Implementation Notes
- All pages share the same design language and color scheme
- Role selection is dropdown-based for better UX
- The system is ready for backend integration with role-based authentication

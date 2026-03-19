# DentaNet Frontend Structure

## File Organization

### Pages
- **login.html** - Role-based login page with dropdown to select Student/Lecturer/Admin
- **signup.html** - Role-based signup page for new user registration
- **reset-password.html** - Password reset page (role-agnostic)

### Components (Reusable)
- **components/header.html** - Common navigation header
- **components/footer.html** - Common footer with links and social media

### Assets
- **public/images/** - Images (bg.jpg, logo.png)
- **public/css/styles.css** - External stylesheet for custom styles

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
- Login page ↔ Signup page
- Login page → Reset Password page
- All pages use common header and footer components

## Implementation Notes
- All pages share the same design language and color scheme
- Role selection is dropdown-based for better UX
- Components (header/footer) can be included using server-side includes or JavaScript
- The system is ready for backend integration with role-based authentication

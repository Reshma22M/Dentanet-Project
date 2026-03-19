# DentaNet React Components

This directory contains modular React/JSX components for the DentaNet LMS frontend.

## Component Structure

### Core Components

#### SignupPage.jsx
Main signup page component that orchestrates the entire registration flow.
- Manages dark mode state
- Handles form submission
- Coordinates all child components

#### Components Directory

##### Header.jsx
Reusable navigation header component
- Fixed position header with backdrop blur
- Responsive navigation menu
- DentaNet branding with icon
- Login button integration

##### Footer.jsx
Reusable footer component
- Quick links section
- Social media icons (Twitter, Instagram, Facebook)
- Copyright information
- Fully responsive layout

##### SignupForm.jsx
Main registration form component
- Form state management
- Input validation
- Password confirmation check
- Integration with RoleSelector
- Submit handling

##### RoleSelector.jsx
Interactive role selection component
- Visual role buttons (Student, Lecturer, Admin)
- Active state management
- Icon-based UI with Material Symbols
- Passes selected role to parent form

## Usage

### For React Projects

```jsx
import SignupPage from './SignupPage';

function App() {
  return <SignupPage />;
}
```

### Component Features

- **Modular Design**: Each component is self-contained and reusable
- **State Management**: Uses React hooks (useState) for local state
- **Props Interface**: Clean prop passing between components
- **Responsive**: Mobile-first design with Tailwind CSS
- **Dark Mode**: Built-in dark mode support
- **Validation**: Client-side form validation
- **Accessibility**: Semantic HTML and proper labels

## Styling

Components use Tailwind CSS utility classes. Custom styles are defined in:
- `public/css/styles.css` for glass-card and background effects

## Integration Notes

To use these components in a React application:

1. Install dependencies:
   ```bash
   npm install react react-dom
   ```

2. Ensure Tailwind CSS is configured

3. Include Material Symbols font in your HTML:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"/>
   ```

4. Import and use components as needed

## Benefits of Component-Based Approach

- **Reusability**: Components can be used across multiple pages
- **Maintainability**: Easier to update and debug isolated components
- **Testability**: Each component can be tested independently
- **Scalability**: Easy to add new features without affecting existing code
- **Collaboration**: Multiple developers can work on different components

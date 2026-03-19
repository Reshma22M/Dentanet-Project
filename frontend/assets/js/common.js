// DentaNet Common JavaScript Configuration

// Tailwind CSS Configuration
tailwind.config = {
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: "#3B82F6",
                student: "#90cdf4",
                lecturer: "#a78bfa",
                admin: "#6D5CB3",
                "background-light": "#F9FAFB",
                "background-dark": "#111827",
                secondary: "#9B8CCB",
                accent: "#EFEBFF"
            },
            fontFamily: {
                display: ["Inter", "sans-serif"],
                sans: ["Inter", "sans-serif"],
            },
            borderRadius: {
                DEFAULT: "0.5rem",
                'xl': '1rem'
            },
        },
    },
};

// Dark Mode Toggle Function
function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    // Save preference to localStorage
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
}

// Load Dark Mode Preference
function loadDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'enabled') {
        document.documentElement.classList.add('dark');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadDarkModePreference();
});

// Tab Switching Function
function switchTab(tabName, tabGroup = 'default') {
    const tabs = document.querySelectorAll(`[data-tab-group="${tabGroup}"]`);
    const contents = document.querySelectorAll(`[data-content-group="${tabGroup}"]`);
    
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.remove('tab-inactive');
            tab.classList.add('tab-active');
        } else {
            tab.classList.remove('tab-active');
            tab.classList.add('tab-inactive');
        }
    });
    
    contents.forEach(content => {
        if (content.dataset.content === tabName) {
            content.classList.remove('hidden');
        } else {
            content.classList.add('hidden');
        }
    });
}

// Success Notification Toast
function showSuccessNotification(message = 'Operation completed successfully!') {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in';
    notification.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-symbols-outlined">check_circle</span>
            <span class="font-semibold">${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('animate-fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Error Notification Toast
function showErrorNotification(message = 'An error occurred. Please try again.') {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-slide-in';
    notification.innerHTML = `
        <div class="flex items-center gap-2">
            <span class="material-symbols-outlined">error</span>
            <span class="font-semibold">${message}</span>
        </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('animate-fade-out');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

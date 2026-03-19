// Common Components for DentaNet LMS

class DentaNetComponents {
    static createHeader(userRole = null) {
        const header = document.createElement('header');
        header.className = 'fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800';
        
        header.innerHTML = `
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center gap-2">
                        <img src="public/images/logo.jpg" alt="DentaNet Logo" class="h-14 w-auto rounded-lg shadow-md"/>
                    </div>
                    <nav class="hidden md:flex items-center gap-8">
                        <a class="text-sm font-medium hover:text-primary transition-colors" href="index.html">Home</a>
                        <a class="text-sm font-medium hover:text-primary transition-colors" href="index.html#about">About</a>
                        ${!userRole ? 
                            '<a class="bg-primary/10 text-primary hover:bg-primary hover:text-white px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200" href="login.html">Log In</a>' :
                            '<button onclick="logout()" class="text-sm font-medium text-red-600 hover:text-red-700 transition-colors">Logout</button>'
                        }
                    </nav>
                </div>
            </div>
        `;
        
        return header;
    }

    static createSidebar(role, activePage = 'dashboard') {
        const sidebar = document.createElement('aside');
        sidebar.className = 'w-72 bg-[var(--sidebar-bg)] p-6 flex flex-col gap-8 shadow-inner';
        
        const menuItems = {
            student: [
                { icon: 'dashboard', label: 'Dashboard', href: 'student-dashboard.html' },
                { icon: 'edit_document', label: 'Exam Submission', href: 'practical-exam-submission.html' },
                { icon: 'calendar_today', label: 'Lab Booking', href: 'lab-slot-booking.html' },
                { icon: 'menu_book', label: 'Study Materials', href: 'study-materials.html' },
                { icon: 'bar_chart', label: 'Reports & Feedback', href: 'grades-feedback.html' }
            ],
            lecturer: [
                { icon: 'dashboard', label: 'Dashboard', href: 'lecturer-dashboard.html' },
                { icon: 'people', label: 'Students', href: '#' },
                { icon: 'assignment', label: 'Assignments', href: '#' },
                { icon: 'grade', label: 'Grading', href: '#' },
                { icon: 'analytics', label: 'Analytics', href: '#' }
            ],
            admin: [
                { icon: 'dashboard', label: 'Dashboard', href: 'admin-dashboard.html' },
                { icon: 'people', label: 'Users', href: '#' },
                { icon: 'settings', label: 'Settings', href: '#' },
                { icon: 'analytics', label: 'Reports', href: '#' }
            ]
        };

        const items = menuItems[role] || menuItems.student;
        
        sidebar.innerHTML = `
            <div class="flex flex-col gap-1">
                <img src="public/images/logo.jpg" alt="DentaNet Logo" class="h-20 w-auto rounded-lg shadow-md mb-2"/>
                <p class="text-xs font-semibold text-purple-900 opacity-80">University of Dental Sciences</p>
            </div>
            <nav class="flex flex-col gap-2">
                ${items.map(item => `
                    <a class="flex items-center gap-3 px-4 py-3 rounded-xl ${activePage === item.label.toLowerCase() ? 'bg-white/40 text-purple-900 font-semibold' : 'text-purple-900 hover:bg-white/20 font-medium'} transition-all" href="${item.href}">
                        <span class="material-symbols-outlined">${item.icon}</span>
                        <span class="text-sm">${item.label}</span>
                    </a>
                `).join('')}
                <a class="flex items-center gap-3 px-4 py-3 rounded-xl text-purple-900 hover:bg-white/20 font-medium transition-all mt-auto" href="login.html" onclick="logout()">
                    <span class="material-symbols-outlined">logout</span>
                    <span class="text-sm">Logout</span>
                </a>
            </nav>
        `;
        
        return sidebar;
    }

    static createFooter() {
        const footer = document.createElement('footer');
        footer.className = 'mt-auto bg-white border-t border-slate-200 py-8 px-8';
        
        footer.innerHTML = `
            <div class="max-w-6xl mx-auto text-center">
                <p class="text-sm text-slate-600 mb-2">© 2026 University of Peradeniya - Faculty of Dental Sciences</p>
                <p class="text-xs text-slate-400">DentaNet Learning Management System. All rights reserved.</p>
            </div>
        `;
        
        return footer;
    }

    static loadComponents(type, options = {}) {
        const container = document.getElementById(type + '-container');
        if (!container) return;

        let component;
        switch(type) {
            case 'header':
                component = this.createHeader(options.userRole);
                break;
            case 'sidebar':
                component = this.createSidebar(options.role, options.activePage);
                break;
            case 'footer':
                component = this.createFooter();
                break;
        }

        if (component) {
            container.appendChild(component);
        }
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    }
}

window.DentaNetComponents = DentaNetComponents;

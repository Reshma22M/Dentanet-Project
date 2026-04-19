/**
 * student-shell.js
 * Shared FIXED header, sidebar, footer for all student pages.
 *
 * Layout: Header fixed top, Sidebar fixed left, Main content scrolls independently.
 *
 * Each page should:
 *   1. Include this script in <head> or before </body>
 *   2. Have a <body data-student-page="pageName"> attribute
 *      pageName can be: dashboard, submission, labslot, materials, grades, profile
 *   3. Have <div id="shell-header"></div> where header goes
 *   4. Have <div id="shell-sidebar"></div> where sidebar goes
 *   5. Have <div id="shell-footer"></div> where footer goes
 *
 * The script also restructures the page layout so:
 *   - Header is fixed at top (never moves)
 *   - Sidebar is fixed at left (never moves)
 *   - Only the <main> content area scrolls
 */

(function () {
  const API_BASE = (typeof API_BASE_URL === "string" && API_BASE_URL.startsWith("http"))
    ? API_BASE_URL.replace(/\/api$/, "")
    : window.location.origin;

  const SIDEBAR_LINKS = [
    { id: "dashboard",  icon: "dashboard",      label: "Dashboard",          href: "student-dashboard.html" },
    { id: "submission", icon: "assignment",      label: "Submission",         href: "submission-hub.html" },
    { id: "labslot",    icon: "event_available", label: "Lab Slot Timetable", href: "lab-slot-booking.html" },
    { id: "materials",  icon: "auto_stories",    label: "Study Materials",    href: "study-materials.html" },
    { id: "grades",     icon: "insights",        label: "Grades & Feedback",  href: "grades-feedback.html" },
    // module page — nav highlights Dashboard as closest parent
  ];

  function getHeaderHTML() {
    return `
    <nav class="fixed top-0 left-0 right-0 z-50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-purple-100 dark:border-gray-800 px-4 h-14 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <a href="student-dashboard.html"><img src="purple-logo.svg" alt="DentaNet" class="h-32 w-auto" /></a>
      </div>
      <div class="flex items-center gap-3">
        <button id="shellDarkToggle" type="button" title="Toggle dark mode"
          class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-purple-100 dark:hover:bg-gray-800 transition-colors">
          <span class="material-icons-round text-primary dark:text-yellow-400 text-[22px]">dark_mode</span>
        </button>
        <button id="shellNotifBtn" type="button" title="Notifications"
          class="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-purple-100 dark:hover:bg-gray-800 transition-colors">
          <span class="material-icons-round text-gray-500 dark:text-gray-400 text-[22px]">notifications</span>
          <span id="shellNotifBadge" class="hidden absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900"></span>
        </button>
        <button id="shellLogoutBtn" type="button"
          class="hidden md:inline-flex px-5 py-2 bg-primary text-white rounded-full text-sm font-semibold shadow-lg shadow-purple-200 dark:shadow-none hover:bg-primary-dark transition-all">
          Log Out
        </button>
      </div>
    </nav>
    <div id="shellNotifPanel" class="fixed top-14 right-4 z-[55] hidden w-80 max-h-[60vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-purple-100 dark:border-gray-800 overflow-hidden">
      <div class="p-4 border-b border-purple-100 dark:border-gray-800 flex items-center justify-between">
        <h3 class="font-bold text-gray-900 dark:text-white text-sm">Notifications</h3>
        <button id="shellNotifClose" type="button" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <span class="material-icons-round text-[18px]">close</span>
        </button>
      </div>
      <div id="shellNotifList" class="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No new notifications</p>
      </div>
    </div>`;
  }

  function decodeToken() {
    try {
      var token = localStorage.getItem("authToken") || localStorage.getItem("token");
      if (!token) return null;
      var payload = JSON.parse(atob(token.split(".")[1]));
      return payload || null;
    } catch (e) {
      return null;
    }
  }

  function formatNotificationTime(value) {
    if (!value) return "";
    var parsed = new Date(value);
    if (isNaN(parsed.getTime())) return "";
    return parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function renderNotificationList(items) {
    var listEl = document.getElementById("shellNotifList");
    var badgeEl = document.getElementById("shellNotifBadge");
    if (!listEl) return;

    var notifications = Array.isArray(items) ? items : [];
    var unreadCount = notifications.filter(function (n) { return !n.is_read; }).length;

    if (badgeEl) {
      if (unreadCount > 0) badgeEl.classList.remove("hidden");
      else badgeEl.classList.add("hidden");
    }

    if (!notifications.length) {
      listEl.innerHTML = '<p class="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No notifications yet</p>';
      return;
    }

    listEl.innerHTML = notifications.map(function (notification) {
      var unread = !notification.is_read;
      var stateClass = unread
        ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800"
        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 opacity-80";

      var dot = unread
        ? '<span class="inline-block w-2 h-2 rounded-full bg-primary mt-1.5"></span>'
        : '<span class="inline-block w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 mt-1.5"></span>';

      return (
        '<button type="button" data-notif-id="' + notification.notification_id + '" class="shell-notif-item w-full text-left p-3 rounded-xl border ' + stateClass + ' hover:shadow-sm transition-all">' +
          '<div class="flex items-start gap-2">' +
            dot +
            '<div class="min-w-0">' +
              '<p class="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">' + String(notification.title || "Notification").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</p>' +
              '<p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5">' + String(notification.message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</p>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">' + formatNotificationTime(notification.created_at) + '</p>' +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join("");

    Array.prototype.forEach.call(listEl.querySelectorAll(".shell-notif-item"), function (itemBtn) {
      itemBtn.addEventListener("click", async function () {
        var notifId = itemBtn.getAttribute("data-notif-id");
        if (!notifId || typeof API === "undefined" || !API.notifications) return;

        try {
          await API.notifications.markAsRead(notifId);
          await loadShellNotifications();
        } catch (e) {
          // keep UI usable even if mark-as-read fails
        }
      });
    });
  }

  async function loadShellNotifications() {
    if (typeof API === "undefined" || !API.notifications) return;

    var payload = decodeToken();
    if (!payload || !payload.id) return;

    try {
      var result = await API.notifications.getByUser(payload.id);
      if (!result || !result.ok) return;
      renderNotificationList(result.notifications || []);
    } catch (e) {
      // silent for shell-level utility
    }
  }

  function getSidebarHTML(activePage) {
    const navItems = SIDEBAR_LINKS.map(function (link) {
      var isActive = link.id === activePage;
      var cls = isActive
        ? "flex items-center gap-3 px-4 py-3 bg-primary text-white rounded-xl shadow-md"
        : "flex items-center gap-3 px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-purple-100 dark:hover:bg-gray-800 rounded-xl transition-colors";
      return '<a class="' + cls + '" href="' + link.href + '">' +
        '<span class="material-icons-round text-[20px]">' + link.icon + '</span>' +
        '<span class="font-medium">' + link.label + '</span></a>';
    }).join("\n");

    return `
    <aside class="fixed top-14 left-0 bottom-0 w-72 bg-sidebar-light dark:bg-sidebar-dark p-6 hidden lg:flex flex-col border-r border-purple-100 dark:border-gray-800 z-40 overflow-y-auto">
      <div class="mb-8">
        <h2 class="text-xs font-bold uppercase tracking-widest text-primary mb-1">LMS</h2>
        <p class="text-sm font-semibold text-gray-700 dark:text-gray-400">University of Peradeniya</p>
      </div>
      <nav class="space-y-2 flex-1">
        ${navItems}
      </nav>
      <a href="student-profile.html" class="mt-auto pt-6 border-t border-purple-200 dark:border-gray-700 flex items-center gap-3 hover:opacity-90 transition">
        <img id="shellSidebarAvatar" alt="Profile" class="w-10 h-10 rounded-full border-2 border-primary/30 object-cover" src="public/images/profile-placeholder.svg"/>
        <div>
          <p id="shellSidebarName" class="text-sm font-bold text-gray-900 dark:text-white">Student</p>
          <p class="text-[10px] text-primary font-bold uppercase tracking-wider">Dental Student</p>
        </div>
      </a>
    </aside>`;
  }

  function getFooterHTML() {
    return `
    <footer class="bg-sidebar-light dark:bg-sidebar-dark border-t border-purple-100 dark:border-gray-800 py-12 px-6">
      <div class="max-w-7xl mx-auto flex flex-col items-center">
        <div class="flex flex-wrap justify-center gap-8 mb-8 text-sm font-medium text-gray-500 dark:text-gray-400">
          <a class="hover:text-primary transition-colors" href="#">Privacy Policy</a>
          <a class="hover:text-primary transition-colors" href="#">Terms of Service</a>
          <a class="hover:text-primary transition-colors" href="#">Contact Us</a>
          <a class="hover:text-primary transition-colors" href="#">For Students</a>
          <a class="hover:text-primary transition-colors" href="#">For Lecturers</a>
          <a class="hover:text-primary transition-colors" href="#">Lab Services</a>
        </div>
        <div class="flex gap-6 mb-8 text-gray-400">
          <a class="hover:text-primary transition-colors" href="#"><span class="material-icons-round">facebook</span></a>
          <a class="hover:text-primary transition-colors" href="#"><span class="material-icons-round">alternate_email</span></a>
          <a class="hover:text-primary transition-colors" href="#"><span class="material-icons-round">groups</span></a>
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 font-medium">&copy; 2025 DentaNet LMS. All rights reserved.</p>
      </div>
    </footer>`;
  }

  // Run on DOM ready
  document.addEventListener("DOMContentLoaded", function () {
    var activePage = document.body.getAttribute("data-student-page") || "";
    if (!activePage) return; // Not a shell page

    // Inject shell parts
    var headerMount = document.getElementById("shell-header");
    if (headerMount) headerMount.innerHTML = getHeaderHTML();

    var sidebarMount = document.getElementById("shell-sidebar");
    if (sidebarMount) sidebarMount.innerHTML = getSidebarHTML(activePage);

    var footerMount = document.getElementById("shell-footer");
    if (footerMount) footerMount.innerHTML = getFooterHTML();

    // Apply fixed layout styles to body and main
    document.body.classList.add("overflow-hidden");

    // Find the main content area and make it the only scrollable region
    var mainEl = document.querySelector("main");
    if (mainEl) {
      // Use mt-14 to clear the h-14 fixed header, and limit height so it scrolls within viewport
      mainEl.classList.add("mt-14", "lg:ml-72", "h-[calc(100vh-3.5rem)]", "overflow-y-auto");
    }

    // Wire events
    var darkBtn = document.getElementById("shellDarkToggle");
    if (darkBtn) darkBtn.addEventListener("click", function () {
      document.documentElement.classList.toggle("dark");
    });

    var logoutBtn = document.getElementById("shellLogoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      if (typeof API !== "undefined" && API.auth && API.auth.logout) {
        API.auth.logout();
      } else {
        localStorage.removeItem("token");
        window.location.href = "login.html";
      }
    });

    var notifBtn = document.getElementById("shellNotifBtn");
    var notifPanel = document.getElementById("shellNotifPanel");
    if (notifBtn && notifPanel) {
      notifBtn.addEventListener("click", function () {
        notifPanel.classList.toggle("hidden");
        if (!notifPanel.classList.contains("hidden")) {
          loadShellNotifications();
        }
      });
      var closeBtn = document.getElementById("shellNotifClose");
      if (closeBtn) closeBtn.addEventListener("click", function () { notifPanel.classList.add("hidden"); });
      document.addEventListener("click", function (e) {
        if (!notifPanel.contains(e.target) && !notifBtn.contains(e.target)) {
          notifPanel.classList.add("hidden");
        }
      });
    }

    // Load profile from token
    try {
      var token = localStorage.getItem("token");
      if (token) {
        var payload = JSON.parse(atob(token.split(".")[1]));
        var fullName = ((payload.firstName || "") + " " + (payload.lastName || "")).trim() || "Student";

        var nameEl = document.getElementById("shellSidebarName");
        if (nameEl) nameEl.textContent = fullName;

        if (payload.profile_image_url) {
          var avatar = document.getElementById("shellSidebarAvatar");
          if (avatar) avatar.src = API_BASE + payload.profile_image_url + "?t=" + Date.now();
        }
      }
    } catch (e) { /* silent */ }

    loadShellNotifications();
    setInterval(loadShellNotifications, 30000);
  });
})();

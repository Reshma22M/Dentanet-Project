// DentaNet Common JavaScript Configuration

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
                sans: ["Inter", "sans-serif"]
            },
            borderRadius: {
                DEFAULT: "0.5rem",
                xl: "1rem"
            }
        }
    }
};

function toggleDarkMode() {
    document.documentElement.classList.toggle("dark");
    const isDark = document.documentElement.classList.contains("dark");
    localStorage.setItem("darkMode", isDark ? "enabled" : "disabled");
}

function loadDarkModePreference() {
    const darkMode = localStorage.getItem("darkMode");
    if (darkMode === "enabled") {
        document.documentElement.classList.add("dark");
    }
}

function switchTab(tabName, tabGroup = "default") {
    const tabs = document.querySelectorAll(`[data-tab-group="${tabGroup}"]`);
    const contents = document.querySelectorAll(`[data-content-group="${tabGroup}"]`);

    tabs.forEach((tab) => {
        if (tab.dataset.tab === tabName) {
            tab.classList.remove("tab-inactive");
            tab.classList.add("tab-active");
        } else {
            tab.classList.remove("tab-active");
            tab.classList.add("tab-inactive");
        }
    });

    contents.forEach((content) => {
        if (content.dataset.content === tabName) {
            content.classList.remove("hidden");
        } else {
            content.classList.add("hidden");
        }
    });
}

function ensureToastContainer() {
    let container = document.getElementById("dentanet-toast-container");

    if (!container) {
        container = document.createElement("div");
        container.id = "dentanet-toast-container";
        container.className = "fixed top-4 right-4 z-[9999] flex w-[min(92vw,380px)] flex-col gap-3";
        document.body.appendChild(container);
    }

    return container;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function ensureConfirmModal() {
    let modal = document.getElementById("dentanet-confirm-modal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "dentanet-confirm-modal";
        modal.className = "fixed inset-0 z-[10000] hidden items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4";

        modal.innerHTML = `
            <div class="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div class="p-6">
                    <div class="flex items-start gap-3">
                        <div class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#EFEBFF] text-[#6D5CB3] dark:bg-[#6D5CB3]/20 dark:text-[#c4b5fd]">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5">
                                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
                                <path d="M9.6 9.2a2.4 2.4 0 1 1 3.7 2c-.9.6-1.3 1-1.3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
                                <path d="M12 17h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"></path>
                            </svg>
                        </div>
                        <div class="flex-1">
                            <h3 id="dentanet-confirm-title" class="text-lg font-bold text-slate-800 dark:text-white">Confirm Action</h3>
                            <p id="dentanet-confirm-message" class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                                Are you sure?
                            </p>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700">
                    <button id="dentanet-confirm-cancel" type="button" class="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:opacity-90">
                        Cancel
                    </button>
                    <button id="dentanet-confirm-ok" type="button" class="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700">
                        Confirm
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    return modal;
}

function showConfirmDialog({
    title = "Confirm Action",
    message = "Are you sure you want to continue?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmClass = "bg-red-600 hover:bg-red-700"
} = {}) {
    return new Promise((resolve) => {
        const modal = ensureConfirmModal();
        const titleEl = document.getElementById("dentanet-confirm-title");
        const messageEl = document.getElementById("dentanet-confirm-message");
        const okBtn = document.getElementById("dentanet-confirm-ok");
        const cancelBtn = document.getElementById("dentanet-confirm-cancel");

        titleEl.textContent = title;
        messageEl.textContent = message;
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        okBtn.className = `px-4 py-2 rounded-lg text-white font-medium ${confirmClass}`;
        cancelBtn.className = "px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:opacity-90";

        modal.classList.remove("hidden");
        modal.classList.add("flex");

        function cleanup(result) {
            modal.classList.add("hidden");
            modal.classList.remove("flex");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            modal.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKeydown);
            resolve(result);
        }

        function onOk() {
            cleanup(true);
        }

        function onCancel() {
            cleanup(false);
        }

        function onBackdrop(e) {
            if (e.target === modal) cleanup(false);
        }

        function onKeydown(e) {
            if (e.key === "Escape") cleanup(false);
        }

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        modal.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKeydown);
    });
}

function getToastIconSvg(type = "info") {
    const iconMap = {
        success: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5"><path d="M20 7L10 17l-6-6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5"><path d="M12 3L2.5 19.5h19L12 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9v5m0 3h.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-5 w-5"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 11v5m0-8h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`
    };

    return iconMap[type] || iconMap.info;
}

function showNotification(type = "info", message = "", duration = 3500) {
    const container = ensureToastContainer();

    const config = {
        success: {
            icon: "check_circle",
            title: "Success",
            accent: "border-emerald-500"
        },
        error: {
            icon: "error",
            title: "Error",
            accent: "border-rose-500"
        },
        warning: {
            icon: "warning",
            title: "Warning",
            accent: "border-amber-500"
        },
        info: {
            icon: "info",
            title: "Notice",
            accent: "border-[#6D5CB3]"
        }
    };

    const selected = config[type] || config.info;

    const toast = document.createElement("div");
    toast.className = `
        dentanet-toast pointer-events-auto overflow-hidden rounded-2xl border-l-4 ${selected.accent}
        bg-white/95 dark:bg-slate-900/95
        shadow-[0_12px_35px_rgba(109,92,179,0.18)]
        backdrop-blur-md
        ring-1 ring-slate-200/70 dark:ring-slate-700/70
        transform transition-all duration-300 ease-out
        opacity-0 translate-y-2
    `;

    toast.innerHTML = `
        <div class="flex items-start gap-3 p-4">
            <div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFEBFF] text-[#6D5CB3] dark:bg-[#6D5CB3]/20 dark:text-[#c4b5fd]">
                ${getToastIconSvg(type)}
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-900 dark:text-slate-100">${selected.title}</p>
                <p class="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300 break-words">${escapeHtml(message)}</p>
            </div>
            <button type="button" class="toast-close rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" class="h-[18px] w-[18px]">
                    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
        <div class="h-1 w-full bg-slate-100 dark:bg-slate-800">
            <div class="toast-progress h-full bg-gradient-to-r from-[#6D5CB3] to-[#9B8CCB]"></div>
        </div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove("opacity-0", "translate-y-2");
    });

    const progress = toast.querySelector(".toast-progress");
    if (progress) {
        progress.style.transition = `width ${duration}ms linear`;
        requestAnimationFrame(() => {
            progress.style.width = "0%";
        });
    }

    let removed = false;

    function removeToast() {
        if (removed) return;
        removed = true;
        toast.classList.add("opacity-0", "translate-x-4");
        setTimeout(() => toast.remove(), 250);
    }

    const closeBtn = toast.querySelector(".toast-close");
    if (closeBtn) {
        closeBtn.addEventListener("click", removeToast);
    }

    setTimeout(removeToast, duration);
}

function showSuccessNotification(message = "Operation completed successfully.") {
    showNotification("success", message);
}

function showErrorNotification(message = "An error occurred. Please try again.") {
    showNotification("error", message);
}

function showWarningNotification(message = "Please check the entered details.") {
    showNotification("warning", message);
}

function showInfoNotification(message = "Here is an update.") {
    showNotification("info", message);
}

document.addEventListener("DOMContentLoaded", () => {
    loadDarkModePreference();
    ensureToastContainer();
});

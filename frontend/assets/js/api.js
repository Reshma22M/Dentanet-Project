const API_BASE_URL = (() => {
    const override =
        (typeof window !== "undefined" && window.__DENTANET_API_BASE_URL__) ||
        localStorage.getItem("DENTANET_API_BASE_URL") ||
        "";

    if (override && /^https?:\/\//i.test(override)) {
        return override.replace(/\/$/, "");
    }

    if (typeof window !== "undefined" && window.location?.protocol?.startsWith("http")) {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;

        // Common local setup: frontend on 3000/8080 and backend on 3002.
        if (hostname === "localhost" || hostname === "127.0.0.1") {
            if (port === "3002") return `${window.location.origin}/api`;
            return `${protocol}//${hostname}:3002/api`;
        }

        // Hosted/same-domain reverse proxy setup.
        return `${window.location.origin}/api`;
    }

    return "http://localhost:3002/api";
})();

// -----------------------------
// Helpers
// -----------------------------
function getAuthToken() {
    return localStorage.getItem("authToken");
}

function getAuthHeaders() {
    const token = getAuthToken();
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
}

async function parseResponse(response) {
    let data = {};
    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    return {
        ok: response.ok,
        status: response.status,
        ...data
    };
}

function clearAuthStorage() {
    localStorage.removeItem("authToken");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("pendingPasswordChangeEmail");
    localStorage.removeItem("resetEmail");
}

function saveAuthData(token, user) {
    if (token) {
        localStorage.setItem("authToken", token);
        localStorage.setItem("token", token);
    }
    if (user) {
        localStorage.setItem("user", JSON.stringify(user));
        if (typeof applyCurrentUserProfileImage === "function") {
            applyCurrentUserProfileImage(user);
        }
    }
}

function getFileBaseUrl() {
    if (typeof API_BASE_URL === "string" && API_BASE_URL.startsWith("http")) {
        return API_BASE_URL.replace(/\/api\/?$/, "");
    }
    if (typeof window !== "undefined" && window.location && window.location.origin) {
        return window.location.origin;
    }
    return "";
}

function buildProfileImageUrl(imagePath) {
    if (!imagePath) return null;

    if (/^https?:\/\//i.test(imagePath)) {
        return `${imagePath}${imagePath.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }

    if (imagePath.startsWith("/")) {
        const base = getFileBaseUrl();
        return `${base}${imagePath}?t=${Date.now()}`;
    }

    return imagePath;
}

function applyCurrentUserProfileImage(userOverride = null) {
    try {
        const user = userOverride || getCurrentUser();
        if (!user || !user.profile_image_url) return;

        const role = String(user.role || user.account_type || "").toLowerCase();
        if (!["admin", "student", "lecturer"].includes(role)) return;

        const profileUrl = buildProfileImageUrl(user.profile_image_url);
        if (!profileUrl) return;

        const defaultByRole = {
            admin: "public/images/profile-placeholder.svg",
            lecturer: "public/images/profile-placeholder.svg",
            student: "public/images/profile-placeholder.svg"
        };

        const idTargets = [
            "topProfileImage",
            "adminProfileImage",
            "lecturerProfileImage",
            "studentProfileImage",
            "sidebarProfileImage",
            "shellSidebarAvatar",
            "profilePreview"
        ];

        idTargets.forEach((id) => {
            const img = document.getElementById(id);
            if (img && img.tagName === "IMG") {
                img.src = profileUrl;
            }
        });

        const roleDefault = defaultByRole[role];
        const allImages = document.querySelectorAll("img");
        allImages.forEach((img) => {
            const src = String(img.getAttribute("src") || "");
            const alt = String(img.getAttribute("alt") || "").toLowerCase();
            const isProfileLike = alt.includes("profile") || alt.includes("avatar");
            const isRoleDefault = src.includes(roleDefault);

            if (isProfileLike || isRoleDefault) {
                img.src = profileUrl;
            }
        });
    } catch (error) {
        // Keep auth flow safe even if avatar hydration fails on a page.
        console.warn("Profile image hydration skipped:", error?.message || error);
    }
}

// -----------------------------
// API Object
// -----------------------------
const API = {
    auth: {
        login: async (identifier, password) => {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier, password })
            });

            const data = await parseResponse(response);

            if (data.ok && data.token) {
                saveAuthData(data.token, data.user);
            }

            return data;
        },

        verify: async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/auth/verify`, {
                    method: "GET",
                    headers: getAuthHeaders()
                });

                const data = await parseResponse(response);

                if (data.ok && data.user) {
                    localStorage.setItem("user", JSON.stringify(data.user));
                    if (typeof applyCurrentUserProfileImage === "function") {
                        applyCurrentUserProfileImage(data.user);
                    }
                }

                return data;
            } catch (error) {
                return {
                    ok: false,
                    status: 0,
                    error: "Cannot connect to server"
                };
            }
        },

        firstTimeChangePassword: async (email, currentPassword, newPassword) => {
            const response = await fetch(`${API_BASE_URL}/auth/first-time-change-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, currentPassword, newPassword })
            });

            const data = await parseResponse(response);

            if (data.ok && data.token) {
                saveAuthData(data.token, data.user);
                localStorage.removeItem("pendingPasswordChangeEmail");
            }

            return data;
        },

        changePassword: async (currentPassword, newPassword) => {
            const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ currentPassword, newPassword })
            });

            return await parseResponse(response);
        },

        forgotPassword: async (email) => {
            const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });

            return await parseResponse(response);
        },

        resetPassword: async (email, otp, newPassword) => {
            const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp, newPassword })
            });

            return await parseResponse(response);
        },

        logout: () => {
            clearAuthStorage();
            window.location.href = "login.html";
        }
    },

    registration: {
        createLecturer: async (lecturerData) => {
            const response = await fetch(`${API_BASE_URL}/registration/create-lecturer`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(lecturerData)
            });
            return await parseResponse(response);
        },

        createAdmin: async (adminData) => {
            const response = await fetch(`${API_BASE_URL}/registration/create-admin`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(adminData)
            });
            return await parseResponse(response);
        },

        sendOtp: async (email) => {
            const response = await fetch(`${API_BASE_URL}/registration/send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            return await parseResponse(response);
        },

        verifyAndRegister: async (registrationData) => {
            const response = await fetch(`${API_BASE_URL}/registration/verify-and-register`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(registrationData)
            });
            return await parseResponse(response);
        }
    },

    users: {
        getAll: async () => {
            const response = await fetch(`${API_BASE_URL}/users`, {
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        },

        getMe: async () => {
            const response = await fetch(`${API_BASE_URL}/users/me`, {
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        },

        getById: async (accountType, id) => {
            const response = await fetch(`${API_BASE_URL}/users/${accountType}/${id}`, {
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        },

        update: async (accountType, id, data) => {

        const response = await fetch(
            `${API_BASE_URL}/users/${accountType}/${id}`,
            {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
            }
        );

        return await parseResponse(response);
        },

        delete: async (accountType, id) => {
            const response = await fetch(`${API_BASE_URL}/users/${accountType}/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        },

        restore: async (accountType, id) => {
        const response = await fetch(`${API_BASE_URL}/users/${accountType}/${id}/restore`, {
            method: "PATCH",
            headers: getAuthHeaders()
        });
        return await parseResponse(response);
    },

        updateWithImage: async (accountType, id, formData) => {
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/users/${accountType}/${id}`, {
            method: "PUT",
            headers: {
                ...(token && { Authorization: `Bearer ${token}` })
            },
            body: formData
        });

        return await parseResponse(response);
    }
    },

    bookings: {
        getAll: async (filters = {}) => {
            const params = new URLSearchParams();
            Object.entries(filters || {}).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== "") {
                    params.append(key, value);
                }
            });

            const url = `${API_BASE_URL}/bookings${params.toString() ? `?${params.toString()}` : ""}`;
            const response = await fetch(url, {
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        },

        create: async (bookingData) => {
            const response = await fetch(`${API_BASE_URL}/bookings`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(bookingData)
            });
            return await parseResponse(response);
        },

        updateStatus: async (id, status, machineCode = null) => {
            const payload = { status };
            if (machineCode) payload.machineCode = machineCode;

            const response = await fetch(`${API_BASE_URL}/bookings/${id}/status`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            return await parseResponse(response);
        },

        cancel: async (id) => {
            const response = await fetch(`${API_BASE_URL}/bookings/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        }
    },

    materialTypes: {
        getAll: async () => {
            const response = await fetch(`${API_BASE_URL}/material-types`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        getById: async (id) => {
            const response = await fetch(`${API_BASE_URL}/material-types/${id}`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        }
    },

    materials: {
        getAll: async (moduleId = null, materialTypeId = null) => {
            const params = new URLSearchParams();

            if (moduleId) params.append("module_id", moduleId);
            if (materialTypeId) params.append("material_type_id", materialTypeId);

            const url = `${API_BASE_URL}/materials${params.toString() ? `?${params.toString()}` : ""}`;

            const response = await fetch(url, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        getById: async (id) => {
            const response = await fetch(`${API_BASE_URL}/materials/${id}`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        upload: (formData, onProgress = null) => {

            return new Promise((resolve, reject) => {

                const token = getAuthToken();
                const xhr = new XMLHttpRequest();

                xhr.open("POST", `${API_BASE_URL}/materials`);

                if (token) {
                    xhr.setRequestHeader(
                        "Authorization",
                        `Bearer ${token}`
                    );
                }

                // Upload progress
                xhr.upload.addEventListener("progress", (event) => {

                    if (event.lengthComputable && onProgress) {

                        const percent =
                            Math.round(
                                (event.loaded / event.total) * 100
                            );

                        onProgress(percent);
                    }

                });

                xhr.onload = () => {

                    try {

                        const data =
                            JSON.parse(xhr.responseText);

                        resolve({
                            ok:
                                xhr.status >= 200 &&
                                xhr.status < 300,
                            status: xhr.status,
                            ...data
                        });

                    } catch (error) {

                        resolve({
                            ok: false,
                            status: xhr.status,
                            error: "Invalid server response"
                        });

                    }

                };

                xhr.onerror = () => {

                    reject(
                        new Error(
                            "Network error during upload"
                        )
                    );

                };

                xhr.send(formData);

            });

        },
        
        update: async (id, formData) => {
            const token = getAuthToken();

            const response = await fetch(`${API_BASE_URL}/materials/${id}`, {
                method: "PUT",
                headers: {
                    ...(token && { Authorization: `Bearer ${token}` })
                },
                body: formData
            });

            return await parseResponse(response);
        },

        delete: async (id) => {
            const response = await fetch(`${API_BASE_URL}/materials/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        }
    },

    studyMaterials: {
    getAll: async (moduleId = null, materialTypeId = null) => {
        const params = new URLSearchParams();

        if (moduleId) params.append("module_id", moduleId);
        if (materialTypeId) params.append("material_type_id", materialTypeId);

        const url = `${API_BASE_URL}/study-materials${params.toString() ? `?${params.toString()}` : ""}`;

        const response = await fetch(url, {
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    },

    getById: async (id) => {
        const response = await fetch(`${API_BASE_URL}/study-materials/${id}`, {
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    },

    upload: (formData, onProgress = null) => {
        return new Promise((resolve, reject) => {
            const token = getAuthToken();
            const xhr = new XMLHttpRequest();

            xhr.open("POST", `${API_BASE_URL}/study-materials`);

            if (token) {
                xhr.setRequestHeader("Authorization", `Bearer ${token}`);
            }

            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable && onProgress) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    onProgress(percent);
                }
            });

            xhr.onload = () => {
                try {
                    const data = JSON.parse(xhr.responseText);

                    resolve({
                        ok: xhr.status >= 200 && xhr.status < 300,
                        status: xhr.status,
                        ...data
                    });
                } catch (error) {
                    resolve({
                        ok: false,
                        status: xhr.status,
                        error: "Invalid server response"
                    });
                }
            };

            xhr.onerror = () => {
                reject(new Error("Network error during upload"));
            };

            xhr.send(formData);
        });
    },

    update: async (id, formData) => {
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/study-materials/${id}`, {
            method: "PUT",
            headers: {
                ...(token && { Authorization: `Bearer ${token}` })
            },
            body: formData
        });

        return await parseResponse(response);
    },

    delete: async (id) => {
        const response = await fetch(`${API_BASE_URL}/study-materials/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    }
},

    modules: {
    getAll: async () => {
        const response = await fetch(`${API_BASE_URL}/modules`, {
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    },

    getById: async (id) => {
        const response = await fetch(`${API_BASE_URL}/modules/${id}`, {
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    },

    getMembers: async (id) => {
        const response = await fetch(`${API_BASE_URL}/modules/${id}/members`, {
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    },

    create: async (moduleData) => {
        const response = await fetch(`${API_BASE_URL}/modules`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(moduleData)
        });

        return await parseResponse(response);
    },

    update: async (id, moduleData) => {
        const response = await fetch(`${API_BASE_URL}/modules/${id}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(moduleData)
        });

        return await parseResponse(response);
    },

    delete: async (id) => {
        const response = await fetch(`${API_BASE_URL}/modules/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        return await parseResponse(response);
    },

    uploadImage: async (formData) => {
        const token = getAuthToken();

        const response = await fetch(`${API_BASE_URL}/modules/image`, {
            method: "POST",
            headers: {
                ...(token && { Authorization: `Bearer ${token}` })
            },
            body: formData
        });

        return await parseResponse(response);
    },

    join: async (moduleCode) => {
  const response = await fetch(`${API_BASE_URL}/modules/join`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ module_code: moduleCode })
  });


  return await parseResponse(response);}
},


        exams: {
        getAll: async (moduleId = null, status = null) => {
            const params = new URLSearchParams();

            if (moduleId) params.append("module_id", moduleId);
            if (status) params.append("status", status);

            const url = `${API_BASE_URL}/exams${params.toString() ? `?${params.toString()}` : ""}`;

            const response = await fetch(url, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        getById: async (id) => {
            const response = await fetch(`${API_BASE_URL}/exams/${id}`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        create: async (examData) => {
            const response = await fetch(`${API_BASE_URL}/exams`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(examData)
            });

            return await parseResponse(response);
        },

        update: async (id, examData) => {
            const response = await fetch(`${API_BASE_URL}/exams/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify(examData)
            });

            return await parseResponse(response);
        },

        delete: async (id) => {
            const response = await fetch(`${API_BASE_URL}/exams/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        }
    },

        examSlots: {

        // ===============================
        // Get slots for an exam
        // ===============================
        getByExamId: async (examId) => {

            const response = await fetch(
                `${API_BASE_URL}/exam-slots/exam/${examId}`,
                {
                    headers: getAuthHeaders()
                }
            );

            return await parseResponse(response);
        },

        // ===============================
        // Admin creates exam slots
        // ===============================
        create: async (slotData) => {

            const response = await fetch(
                `${API_BASE_URL}/exam-slots`,
                {
                    method: "POST",
                    headers: getAuthHeaders(),
                    body: JSON.stringify(slotData)
                }
            );

            return await parseResponse(response);
        },

        // ===============================
        // Update slot capacity/status
        // ===============================
        update: async (slotId, slotData) => {

            const response = await fetch(
                `${API_BASE_URL}/exam-slots/${slotId}`,
                {
                    method: "PUT",
                    headers: getAuthHeaders(),
                    body: JSON.stringify(slotData)
                }
            );

            return await parseResponse(response);
        },

        // ===============================
        // Delete slot
        // ===============================
        delete: async (slotId) => {

            const response = await fetch(
                `${API_BASE_URL}/exam-slots/${slotId}`,
                {
                    method: "DELETE",
                    headers: getAuthHeaders()
                }
            );

            return await parseResponse(response);
        }

    },

    machines: {
    getAll: async () => {
        const response = await fetch(`${API_BASE_URL}/machines`, {
            headers: getAuthHeaders()
        });
        return await parseResponse(response);
    },

    create: async (machineData) => {
        const response = await fetch(`${API_BASE_URL}/machines`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(machineData)
        });
        return await parseResponse(response);
    },

    update: async (id, machineData) => {
        const response = await fetch(`${API_BASE_URL}/machines/${id}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(machineData)
        });
        return await parseResponse(response);
    }
},

    notifications: {
        getByUser: async (userId) => {
            const uid = userId || (getCurrentUser() && getCurrentUser().id);

            if (!uid) {
                return {
                    ok: false,
                    error: "No user id provided"
                };
            }

            const response = await fetch(`${API_BASE_URL}/notifications/${uid}`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        markAsRead: async (id) => {
            const response = await fetch(`${API_BASE_URL}/notifications/${id}/read`, {
                method: "PUT",
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        create: async (notificationData) => {
            const response = await fetch(`${API_BASE_URL}/notifications`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(notificationData)
            });

            return await parseResponse(response);
        }
    },

    submissions: {
        getLecturerBatchPerformanceReport: async (filters = {}) => {
            const params = new URLSearchParams();
            Object.entries(filters || {}).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== "") {
                    params.append(key, value);
                }
            });

            const response = await fetch(
                `${API_BASE_URL}/submissions/lecturer/reports/batch-performance${params.toString() ? `?${params.toString()}` : ""}`,
                { headers: getAuthHeaders() }
            );

            return await parseResponse(response);
        },

        getLecturerAiAccuracyReport: async (filters = {}) => {
            const params = new URLSearchParams();
            Object.entries(filters || {}).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== "") {
                    params.append(key, value);
                }
            });

            const response = await fetch(
                `${API_BASE_URL}/submissions/lecturer/reports/ai-accuracy${params.toString() ? `?${params.toString()}` : ""}`,
                { headers: getAuthHeaders() }
            );

            return await parseResponse(response);
        }
    },

    admin: {

    updateProfile: async (id, data) => {

        const response = await fetch(
        `${API_BASE_URL}/admins/${id}`,
        {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        }
        );

        return await parseResponse(response);

    }

    },

    evaluations: {
        getBySubmission: async (submissionId) => {
            const response = await fetch(`${API_BASE_URL}/evaluations/${submissionId}`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        },

        submitAI: async (evaluationData) => {
            const response = await fetch(`${API_BASE_URL}/evaluations/ai`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(evaluationData)
            });

            return await parseResponse(response);
        },

        submitLecturer: async (evaluationData) => {
            const response = await fetch(`${API_BASE_URL}/evaluations/lecturer`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(evaluationData)
            });

            return await parseResponse(response);
        },

        getAI: async (submissionId) => {
            const response = await fetch(`${API_BASE_URL}/evaluations/ai/${submissionId}`, {
                headers: getAuthHeaders()
            });

            return await parseResponse(response);
        }
    }
};

// -----------------------------
// Global Helpers
// -----------------------------
function getCurrentUser() {
    const userStr = localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
}

function checkAuth() {
    const token = getAuthToken();

    if (!token) {
        window.location.href = "login.html";
        return false;
    }

    return true;
}

async function requireAuth(expectedRole = null) {
    const token = getAuthToken();

    if (!token) {
        window.location.href = "login.html";
        return null;
    }

    const result = await API.auth.verify();

    if (!result.ok || !result.user) {
        clearAuthStorage();
        window.location.href = "login.html";
        return null;
    }

    if (expectedRole && result.user.role !== expectedRole) {
        showErrorNotification("Access denied.");
        window.location.href = "login.html";
        return null;
    }

    return result.user;
}

setInterval(async () => {

const token =
localStorage.getItem("authToken");

if (!token) return;

try {

const result =
await API.auth.verify();

if (!result.ok) {

clearAuthStorage();

showWarningNotification(
"Session expired. Please login again."
);

window.location.href =
"login.html";

}

}
catch (err) {

if (typeof showWarningNotification === "function") {
showWarningNotification("Unable to verify session right now. Please check your connection.");
}

}

}, 300000); // every 5 minutes

document.addEventListener("DOMContentLoaded", () => {
    if (typeof applyCurrentUserProfileImage === "function") {
        applyCurrentUserProfileImage();
    }
});

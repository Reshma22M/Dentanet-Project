const API_BASE_URL = "http://localhost:3000/api";

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
        ...(token && { Authorization: `Bearer ${token}` })
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
    localStorage.removeItem("user");
    localStorage.removeItem("pendingPasswordChangeEmail");
    localStorage.removeItem("resetEmail");
}

function saveAuthData(token, user) {
    if (token) {
        localStorage.setItem("authToken", token);
    }
    if (user) {
        localStorage.setItem("user", JSON.stringify(user));
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
            const response = await fetch(`${API_BASE_URL}/auth/verify`, {
                method: "GET",
                headers: getAuthHeaders()
            });

            const data = await parseResponse(response);

            if (data.ok && data.user) {
                localStorage.setItem("user", JSON.stringify(data.user));
            }

            return data;
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

        getById: async (id) => {
            const response = await fetch(`${API_BASE_URL}/users/${id}`, {
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        },

        update: async (id, userData) => {
            const response = await fetch(`${API_BASE_URL}/users/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify(userData)
            });
            return await parseResponse(response);
        },

        delete: async (id) => {
            const response = await fetch(`${API_BASE_URL}/users/${id}`, {
                method: "DELETE",
                headers: getAuthHeaders()
            });
            return await parseResponse(response);
        }
    },

    bookings: {
        getAll: async () => {
            const response = await fetch(`${API_BASE_URL}/bookings`, {
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

        updateStatus: async (id, status, machineId = null) => {
            const payload = { status };
            if (machineId) payload.machineId = machineId;

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

    materials: {
        getAll: async (moduleId = null, materialType = null, category = null) => {
            const params = new URLSearchParams();

            if (moduleId) params.append("module_id", moduleId);
            if (materialType) params.append("material_type", materialType);
            if (category) params.append("category", category);

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

        upload: async (formData) => {
            const token = getAuthToken();

            const response = await fetch(`${API_BASE_URL}/materials`, {
                method: "POST",
                headers: {
                    ...(token && { Authorization: `Bearer ${token}` })
                },
                body: formData
            });

            return await parseResponse(response);
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
        alert("Access denied");
        window.location.href = "login.html";
        return null;
    }

    return result.user;
}
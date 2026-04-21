//Validation Middleware for DentaNet LMS

// ========================================
// 1. GENERAL VALIDATORS
// ========================================

const validateEmail = (email) => {
    if (!email) {
        return { valid: false, error: "Email is required" };
    }

    const trimmedEmail = email.trim();

    if (trimmedEmail.length > 255) {
        return { valid: false, error: "Email must not exceed 255 characters" };
    }

    if (trimmedEmail.includes(" ")) {
        return { valid: false, error: "Email cannot contain spaces" };
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
        return { valid: false, error: "Invalid email format" };
    }

    return { valid: true, sanitized: trimmedEmail.toLowerCase() };
};

const validatePassword = (
    password,
    email = '',
    username = '',
    currentPassword = ''
) => {
    if (!password) {
        return { valid: false, error: 'Password is required' };
    }

    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters long' };
    }

    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one uppercase letter' };
    }

    if (!/[a-z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one lowercase letter' };
    }

    if (!/\d/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' };
    }

    if (!/[@$!%*?&]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one special character (@$!%*?&)' };
    }

    if (email && password.toLowerCase() === email.toLowerCase()) {
        return { valid: false, error: 'Password cannot be the same as email' };
    }

    if (username && password.toLowerCase() === username.toLowerCase()) {
        return { valid: false, error: 'Password cannot be the same as username' };
    }

    if (currentPassword && password === currentPassword) {
        return { valid: false, error: 'New password must be different from the current password' };
    }

    return { valid: true };
};

const validateFullName = (fullName) => {
    if (!fullName) {
        return { valid: false, error: "Full name is required" };
    }

    const trimmedName = fullName.trim();

    if (trimmedName.length < 3) {
        return { valid: false, error: "Full name must be at least 3 characters" };
    }

    if (trimmedName.length > 200) {
        return { valid: false, error: "Full name must not exceed 200 characters" };
    }

    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(trimmedName)) {
        return { valid: false, error: "Full name can only contain letters and spaces" };
    }

    return { valid: true, sanitized: trimmedName };
};

const validateProfileImage = (file) => {
    if (!file) {
        return { valid: true };
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.mimetype)) {
        return { valid: false, error: "Profile image must be JPG or PNG format" };
    }

    const maxSizeMB = 2;
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > maxSizeMB) {
        return { valid: false, error: `Profile image must not exceed ${maxSizeMB}MB` };
    }

    return { valid: true, sizeMB: fileSizeMB };
};

// ========================================
// 2. STUDENT VALIDATORS
// ========================================

const validateStudentRegistrationNumber = (regNumber) => {
    if (!regNumber) {
        return { valid: false, error: "Registration number is required for students" };
    }

    const normalized = regNumber.trim().toUpperCase();
    const regNumberRegex = /^DENT\/\d{4}\/\d{3}$/;

    if (!regNumberRegex.test(normalized)) {
        return {
            valid: false,
            error: "Registration number must follow format: DENT/YYYY/XXX (e.g., DENT/2023/001)"
        };
    }

    const parts = normalized.split("/");
    const year = parseInt(parts[1], 10);
    const num = parseInt(parts[2], 10);

    if (year < 2000 || year > 2030) {
        return {
            valid: false,
            error: "Registration number year must be between 2000-2030"
        };
    }

    if (num < 1 || num > 200) {
        return {
            valid: false,
            error: "Registration number must be between 001-200"
        };
    }

    return { valid: true, sanitized: normalized };
};

const allowedDepartments = [
    "Basic Sciences",
    "Community Dental Health",
    "Oral Medicine & Periodontology",
    "Oral & Maxillofacial Surgery",
    "Oral Pathology",
    "Prosthetic Dentistry",
    "Restorative Dentistry"
];

const validateStudentDepartment = (department) => {
    if (!department) {
        return { valid: false, error: "Department is required for students" };
    }

    if (!allowedDepartments.includes(department)) {
        return {
            valid: false,
            error: `Invalid department. Must be one of: ${allowedDepartments.join(", ")}`
        };
    }

    return { valid: true, sanitized: department };
};

// ========================================
// 3. LECTURER VALIDATORS
// ========================================

const validateStaffID = (staffId) => {
    if (!staffId) {
        return { valid: true };
    }

    const normalized = staffId.trim().toUpperCase();
    const staffIdRegex = /^LEC\/\d{3}$/;

    if (!staffIdRegex.test(normalized)) {
        return {
            valid: false,
            error: "Staff ID must follow format: LEC/XXX (e.g., LEC/045)"
        };
    }

    return { valid: true, sanitized: normalized };
};

const validateLecturerDepartment = (department) => {
    if (!department) {
        return { valid: false, error: "Department is required for lecturers" };
    }

    if (!allowedDepartments.includes(department)) {
        return {
            valid: false,
            error: `Invalid department. Must be one of: ${allowedDepartments.join(", ")}`
        };
    }

    return { valid: true, sanitized: department };
};

// ========================================
// 4. ADMIN VALIDATORS
// ========================================

const validateAdminPassword = (password) => {
    if (!password) {
        return { valid: false, error: "Password is required" };
    }

    if (password.length < 12) {
        return { valid: false, error: "Admin password must be at least 12 characters long" };
    }

    return validatePassword(password);
};

// ========================================
// 5. EXAM / FILE VALIDATORS
// ========================================

const validateExamFile = (file) => {
    if (!file) {
        return { valid: false, error: "File is required for exam submission" };
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
        return { valid: false, error: "File must be JPG, PNG, or PDF format" };
    }

    const maxSizeMB = 100;
    const fileSizeMB = file.size / (1024 * 1024);

    if (fileSizeMB > maxSizeMB) {
        return { valid: false, error: `File must not exceed ${maxSizeMB}MB` };
    }

    return { valid: true, sizeMB: fileSizeMB };
};

const isExamDeadlinePassed = (examDate, durationMinutes) => {
    const deadline = new Date(examDate);
    deadline.setMinutes(deadline.getMinutes() + durationMinutes + 120);
    return new Date() > deadline;
};

// ========================================
// 6. MIDDLEWARE FUNCTIONS
// ========================================

const validateStudentRegistration = (req, res, next) => {
    const { email, password, fullName, registrationNumber, department } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
    }
    req.body.email = emailValidation.sanitized;

    const passwordValidation = validatePassword(password, emailValidation.sanitized);
    if (!passwordValidation.valid) {
        return res.status(400).json({ error: passwordValidation.error });
    }

    const nameValidation = validateFullName(fullName);
    if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
    }
    req.body.fullName = nameValidation.sanitized;

    const regNumberValidation = validateStudentRegistrationNumber(registrationNumber);
    if (!regNumberValidation.valid) {
        return res.status(400).json({ error: regNumberValidation.error });
    }
    req.body.registrationNumber = regNumberValidation.sanitized;

    const deptValidation = validateStudentDepartment(department);
    if (!deptValidation.valid) {
        return res.status(400).json({ error: deptValidation.error });
    }
    req.body.department = deptValidation.sanitized;

    next();
};

const validateLecturerRegistration = (req, res, next) => {
    const { email, fullName, staffId, department } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
    }
    req.body.email = emailValidation.sanitized;

    const nameValidation = validateFullName(fullName);
    if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
    }
    req.body.fullName = nameValidation.sanitized;

    if (staffId) {
        const staffIdValidation = validateStaffID(staffId);
        if (!staffIdValidation.valid) {
            return res.status(400).json({ error: staffIdValidation.error });
        }
        req.body.staffId = staffIdValidation.sanitized;
    }

    const deptValidation = validateLecturerDepartment(department);
    if (!deptValidation.valid) {
        return res.status(400).json({ error: deptValidation.error });
    }
    req.body.department = deptValidation.sanitized;

    next();
};

const validateAdminRegistration = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            error: "Only administrators can create admin accounts"
        });
    }

    const { email, password, fullName } = req.body;

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.error });
    }
    req.body.email = emailValidation.sanitized;

    const passwordValidation = validateAdminPassword(password);
    if (!passwordValidation.valid) {
        return res.status(400).json({ error: passwordValidation.error });
    }

    const nameValidation = validateFullName(fullName);
    if (!nameValidation.valid) {
        return res.status(400).json({ error: nameValidation.error });
    }
    req.body.fullName = nameValidation.sanitized;

    next();
};

const validateExamSubmission = (req, res, next) => {
    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: "File is required for exam submission" });
    }

    const fileValidation = validateExamFile(file);
    if (!fileValidation.valid) {
        return res.status(400).json({ error: fileValidation.error });
    }

    req.fileSizeMB = fileValidation.sizeMB;
    next();
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
    validateEmail,
    validatePassword,
    validateFullName,
    validateProfileImage,

    validateStudentRegistrationNumber,
    validateStudentDepartment,

    validateStaffID,
    validateLecturerDepartment,

    validateAdminPassword,

    validateExamFile,
    isExamDeadlinePassed,

    validateStudentRegistration,
    validateLecturerRegistration,
    validateAdminRegistration,
    validateExamSubmission
};
import React, { useState } from 'react';

const RoleSelector = ({ selectedRole, onRoleChange }) => {
  const roles = [
    { id: 'lecturer', icon: 'school', label: 'Lecturer' },
    { id: 'student', icon: 'person', label: 'Student' },
    { id: 'admin', icon: 'admin_panel_settings', label: 'Admin' }
  ];

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
        Select your role
      </label>
      <input type="hidden" name="role" value={selectedRole} required />
      <div className="grid grid-cols-3 gap-3">
        {roles.map((role) => (
          <button
            key={role.id}
            className={`role-button flex flex-col items-center justify-center py-3 px-2 rounded-xl border-2 transition-all group ${
              selectedRole === role.id
                ? 'border-primary bg-primary/5 active'
                : 'border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary'
            }`}
            type="button"
            onClick={() => onRoleChange(role.id)}
          >
            <span 
              className={`material-symbols-outlined mb-1 ${
                selectedRole === role.id
                  ? 'text-primary'
                  : 'text-slate-400 group-hover:text-primary'
              }`}
            >
              {role.icon}
            </span>
            <span 
              className={`text-xs font-bold ${
                selectedRole === role.id
                  ? 'text-primary'
                  : 'text-slate-600 dark:text-slate-400 group-hover:text-primary'
              }`}
            >
              {role.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RoleSelector;

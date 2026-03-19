import React, { useState } from 'react';
import RoleSelector from './RoleSelector';

const SignupForm = ({ onSubmit, onLoginClick }) => {
  const [selectedRole, setSelectedRole] = useState('student');
  const [formData, setFormData] = useState({
    fullName: '',
    universityId: '',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    
    const data = {
      ...formData,
      role: selectedRole
    };
    
    console.log('Registration data:', data);
    onSubmit(data);
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div>
        <label 
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5" 
          htmlFor="full-name"
        >
          Full Name
        </label>
        <input 
          className="w-full px-4 py-3 rounded-xl border-none bg-slate-100 dark:bg-slate-800/50 focus:ring-2 focus:ring-primary dark:text-white transition-all" 
          id="full-name" 
          name="fullName"
          placeholder="John Doe" 
          type="text" 
          value={formData.fullName}
          onChange={handleChange}
          required
        />
      </div>
      
      <div>
        <label 
          className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5" 
          htmlFor="university-id"
        >
          University ID / Email
        </label>
        <input 
          className="w-full px-4 py-3 rounded-xl border-none bg-slate-100 dark:bg-slate-800/50 focus:ring-2 focus:ring-primary dark:text-white transition-all" 
          id="university-id" 
          name="universityId"
          placeholder="IM/2022/087 or name@university.edu" 
          type="text" 
          value={formData.universityId}
          onChange={handleChange}
          required
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label 
            className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5" 
            htmlFor="password"
          >
            Password
          </label>
          <input 
            className="w-full px-4 py-3 rounded-xl border-none bg-slate-100 dark:bg-slate-800/50 focus:ring-2 focus:ring-primary dark:text-white transition-all" 
            id="password" 
            name="password"
            placeholder="••••••••" 
            type="password" 
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <label 
            className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5" 
            htmlFor="confirm-password"
          >
            Confirm Password
          </label>
          <input 
            className="w-full px-4 py-3 rounded-xl border-none bg-slate-100 dark:bg-slate-800/50 focus:ring-2 focus:ring-primary dark:text-white transition-all" 
            id="confirm-password" 
            name="confirmPassword"
            placeholder="••••••••" 
            type="password" 
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>
      </div>
      
      <RoleSelector 
        selectedRole={selectedRole}
        onRoleChange={setSelectedRole}
      />
      
      <button 
        className="w-full bg-primary hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-primary/30 transition-all active:scale-[0.98] mt-4" 
        type="submit"
      >
        Register Account
      </button>
      
      <div className="text-center mt-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Already have an account? 
          <button 
            onClick={onLoginClick}
            className="text-primary font-bold hover:underline ml-1"
            type="button"
          >
            Login
          </button>
        </p>
      </div>
    </form>
  );
};

export default SignupForm;

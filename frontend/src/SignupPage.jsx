import React, { useState } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import SignupForm from './components/SignupForm';

const SignupPage = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const handleSubmit = (data) => {
    console.log('Signup data:', data);
    alert('Registration successful! (This is a demo)');
    // Here you would normally send data to your backend
    // window.location.href = '/login';
  };

  const handleLoginClick = () => {
    window.location.href = '/login';
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={`font-sans text-slate-900 dark:text-slate-100 min-h-screen flex flex-col bg-background-light dark:bg-background-dark ${isDarkMode ? 'dark' : ''}`}>
      <Header onLoginClick={handleLoginClick} />
      
      <main className="flex-grow pt-16 flex items-center justify-center relative overflow-hidden bg-dental">
        <div className="absolute inset-0 bg-sky-500/10 dark:bg-slate-950/40"></div>
        <div className="relative z-10 w-full max-w-xl px-4 py-12">
          <div className="glass-card shadow-2xl rounded-3xl p-8 md:p-10 border border-white/20">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-1.5 mb-2">
                <span className="material-symbols-outlined text-primary text-xl">dentistry</span>
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">DentaNet</span>
              </div>
              <h1 className="text-3xl font-extrabold text-slate-800 dark:text-white">Create your account</h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2">Join our modern dental learning community</p>
            </div>
            
            <SignupForm 
              onSubmit={handleSubmit}
              onLoginClick={handleLoginClick}
            />
          </div>
        </div>
      </main>
      
      <Footer />
      
      <button 
        className="fixed bottom-6 right-6 p-3 rounded-full bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 z-50" 
        onClick={toggleDarkMode}
      >
        <span className="material-symbols-outlined dark:hidden">dark_mode</span>
        <span className="material-symbols-outlined hidden dark:block text-yellow-400">light_mode</span>
      </button>
    </div>
  );
};

export default SignupPage;

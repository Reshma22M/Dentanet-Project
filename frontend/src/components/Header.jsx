import React from 'react';

const Header = ({ onLoginClick }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2">
            <div className="bg-primary rounded-lg p-1.5">
              <span className="material-symbols-outlined text-white text-2xl">dentistry</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-primary">DentaNet</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a className="text-sm font-medium hover:text-primary transition-colors" href="#">Home</a>
            <a className="text-sm font-medium hover:text-primary transition-colors" href="#">About</a>
            <a className="text-sm font-medium hover:text-primary transition-colors" href="#">Contact</a>
            <button 
              onClick={onLoginClick}
              className="bg-primary/10 text-primary hover:bg-primary hover:text-white px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200"
            >
              Log In
            </button>
          </nav>
          <div className="md:hidden">
            <span className="material-symbols-outlined cursor-pointer">menu</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

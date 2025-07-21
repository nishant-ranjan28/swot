// src/components/Header.js
import React from 'react';
import { Link } from 'react-router-dom';

function Header() {
  return (
    <header className="bg-gray-800 text-white p-4 shadow-md sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center">
          {/* Logo/Brand */}
          <div className="text-xl font-bold">
            <Link to="/" className="hover:text-gray-300 transition-colors">
              SWOT Analysis
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="flex gap-4 sm:gap-6">
            <Link
              to="/"
              className="hover:text-gray-300 transition-colors px-2 py-1 rounded"
            >
              Home
            </Link>
            <Link
              to="/news"
              className="hover:text-gray-300 transition-colors px-2 py-1 rounded"
            >
              News
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default Header;

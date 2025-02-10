// src/components/Header.js
import React from 'react';
import { Link } from 'react-router-dom';

const Header = () => {
  return (
    <header className="bg-white shadow-md">
      <nav className="container mx-auto p-4 flex justify-between items-center">
        <div className="text-xl font-bold">SWOT Analysis</div>
        <ul className="flex space-x-4">
          <li>
            <Link to="/" className="text-gray-700 hover:text-blue-500">Home</Link>
          </li>
          <li>
            <Link to="/news" className="text-gray-700 hover:text-blue-500">News</Link>
          </li>
          <li>
            <Link to="/data" className="text-gray-700 hover:text-blue-500">Data</Link>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default Header;
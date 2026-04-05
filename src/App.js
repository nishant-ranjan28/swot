import React from 'react';
import { Route, Routes } from 'react-router-dom';
import './App.css';
import NewsPage from './components/NewsPage';
import Header from './components/Header';
import HomePage from './components/HomePage';
import StockDetailPage from './components/StockDetail/StockDetailPage';

function App() {
  return (
    <div>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stock/:symbol" element={<StockDetailPage />} />
        <Route path="/news" element={<NewsPage />} />
      </Routes>
    </div>
  );
}

export default App;

import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MenuPage from './routes/MenuPage.jsx';
import BeaverphonePage from './routes/BeaverphonePage.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<MenuPage />} />
      <Route path="/beaverphone" element={<BeaverphonePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

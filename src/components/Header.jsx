import React from 'react';
import '../styles/Header.css';

function Header({ username, isDarkMode, toggleDarkMode, onLogout, sidebarOpen, setSidebarOpen }) {
  return (
    <header>
      <button 
        className="navbar-toggler"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>
      
      <div className="NavLogo">
        <h1>Chat Application</h1>
      </div>
      
      <nav className="navbar">
        <a href="/">Home</a>
        <a href="/profile">Profile</a>
        <a href="/help">Help</a>
      </nav>
      
      <div className="button-container">
        <button 
          className="dark-mode-button"
          onClick={toggleDarkMode}
        >
          {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
        
        {username ? (
          <div className="Login-Button">
            <span style={{ marginRight: '10px', color: 'white' }}>Welcome, {username}</span>
            <button 
              className="loginButton"
              onClick={onLogout}
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="Login-Button">
            <button 
              className="loginButton"
              onClick={() => window.location.href = '/login'}
            >
              Login
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export default Header;
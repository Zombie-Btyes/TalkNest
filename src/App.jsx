import React, { useState, useEffect } from 'react';
import ChatRoom from './components/ChatRoom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [username, setUsername] = useState('TestUser');
  const [currentRoom, setCurrentRoom] = useState('General');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // Check for saved theme
    const savedTheme = localStorage.getItem('darkMode');
    if (savedTheme === 'true') {
      setIsDarkMode(true);
      document.body.classList.add('dark-mode');
    }

    // Check for saved user
    const savedUser = localStorage.getItem('username');
    if (savedUser) {
      setUsername(savedUser);
    }
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    if (!isDarkMode) {
      document.body.classList.add('dark-mode');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.body.classList.remove('dark-mode');
      localStorage.setItem('darkMode', 'false');
    }
  };

  const handleLogin = (user) => {
    setUsername(user);
    setIsAuthenticated(true);
    localStorage.setItem('username', user);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername('');
    localStorage.removeItem('username');
  };

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-active' : ''}`}>
      <Header 
        username={username}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      
      <Sidebar 
        isOpen={sidebarOpen}
        currentRoom={currentRoom}
        setCurrentRoom={setCurrentRoom}
      />
      
      <div className="content-wrapper">
        <div id="main-chat">
          <ChatRoom
            username={username}
            currentRoom={currentRoom}
            isAuthenticated={isAuthenticated}
            onLogin={handleLogin}
          />
        </div>
      </div>
      
      <footer>
        <p>© 2024 Chat Application. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default App;
import React from 'react';
import '../styles/Sidebar.css';

function Sidebar({ isOpen, currentRoom, setCurrentRoom }) {
  const rooms = ['General', 'Gaming', 'Programming', 'Music', 'Movies', 'Sports'];

  return (
    <div className={`side-navbar ${isOpen ? 'show' : ''}`}>
      <h2>Chat Rooms</h2>
      
      <div className="room-list">
        {rooms.map((room) => (
          <button
            key={room}
            className={`room-button ${currentRoom === room ? 'active' : ''}`}
            onClick={() => setCurrentRoom(room)}
          >
            # {room}
          </button>
        ))}
      </div>
      
      <div id="sidebar-footer">
        <a href="/settings" className="settings">⚙️ Settings</a>
        <a href="/help" className="settings">❓ Help</a>
      </div>
    </div>
  );
}

export default Sidebar;
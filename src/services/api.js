import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const chatApi = {
  // Messages
  getMessages: (room) => api.get(`/messages/${room}`),
  sendMessage: (message) => api.post('/messages', message),
  
  // Files
  uploadFile: (formData) => {
    return axios.post(`${API_BASE}/upload-video`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  // Session
  updateSession: (data) => api.post('/update-session', data),
  
  // Auth
  login: (credentials) => api.post('/login', credentials),
  logout: () => api.post('/logout'),
};
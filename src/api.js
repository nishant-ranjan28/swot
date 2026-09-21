import axios from 'axios';

const API_BASE_URL = import.meta.env.REACT_APP_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export default api;
export { API_BASE_URL };

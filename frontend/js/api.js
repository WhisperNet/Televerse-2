// API Client for CareForAll Frontend

const api = {
  baseURL: '', // Use relative URLs since we're behind NGINX

  // Get JWT token from localStorage
  getToken() {
    return localStorage.getItem('token');
  },

  // Set JWT token in localStorage
  setToken(token) {
    localStorage.setItem('token', token);
  },

  // Remove JWT token
  removeToken() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // Build headers with JWT if available
  buildHeaders(customHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  },

  // Generic request handler
  async request(url, options = {}) {
    const fullURL = `${this.baseURL}${url}`;

    try {
      const response = await fetch(fullURL, {
        ...options,
        headers: this.buildHeaders(options.headers || {}),
      });

      // Handle 401 Unauthorized - token expired or invalid
      if (response.status === 401) {
        this.removeToken();
        // Don't redirect on auth endpoints
        if (!url.includes('/api/auth/')) {
          window.location.href = '/login.html';
        }
        throw new Error('Unauthorized - Please login again');
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Handle error responses
      if (!response.ok) {
        const errorMessage =
          data.error ||
          data.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      return data;
    } catch (error) {
      console.error('API Request Error:', error);
      throw error;
    }
  },

  // GET request
  async get(url, headers = {}) {
    return this.request(url, {
      method: 'GET',
      headers,
    });
  },

  // POST request
  async post(url, body = {}, headers = {}) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    });
  },

  // PUT request
  async put(url, body = {}, headers = {}) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers,
    });
  },

  // PATCH request
  async patch(url, body = {}, headers = {}) {
    return this.request(url, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers,
    });
  },

  // DELETE request
  async delete(url, headers = {}) {
    return this.request(url, {
      method: 'DELETE',
      headers,
    });
  },
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

/* ============================================================================
   SanjeevaniOps Dashboard - API Service Layer
   Handles all API communication with the FastAPI backend
   ============================================================================ */

const API_BASE_URL = 'http://localhost:8000/api/v1';

// API Error class
class APIError extends Error {
   constructor(message, status, details = null) {
      super(message);
      this.name = 'APIError';
      this.status = status;
      this.details = details;
   }
}

// Generic fetch wrapper with error handling
async function apiFetch(endpoint, options = {}) {
   const url = `${API_BASE_URL}${endpoint}`;

   const defaultOptions = {
      headers: {
         'Content-Type': 'application/json',
         'X-Operator': localStorage.getItem('operator') || 'admin'
      }
   };

   const fetchOptions = { ...defaultOptions, ...options };

   if (options.body && typeof options.body === 'object') {
      fetchOptions.body = JSON.stringify(options.body);
   }

   try {
      const response = await fetch(url, fetchOptions);

      // Handle different status codes
      if (response.status === 204) {
         return null; // No content
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
         const errorMessage = data.detail || data.message || `API Error: ${response.status}`;
         throw new APIError(errorMessage, response.status, data);
      }

      return data;
   } catch (error) {
      if (error instanceof APIError) {
         throw error;
      }

      // Network or other errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
         throw new APIError('Cannot connect to API server. Is it running?', 0);
      }

      throw new APIError(error.message || 'Unknown error occurred', 0);
   }
}

// Application API endpoints
const ApplicationAPI = {
   /**
    * List applications with pagination and filtering
    */
   async list(params = {}) {
      const { status = 'active', limit = 50, offset = 0 } = params;
      const queryParams = new URLSearchParams({ status, limit, offset });
      return await apiFetch(`/applications?${queryParams}`);
   },

   /**
    * Get single application by ID
    */
   async get(appId) {
      return await apiFetch(`/applications/${appId}`);
   },

   /**
    * Register new application
    */
   async create(data) {
      return await apiFetch('/applications', {
         method: 'POST',
         body: data
      });
   },

   /**
    * Update existing application
    */
   async update(appId, data) {
      return await apiFetch(`/applications/${appId}`, {
         method: 'PUT',
         body: data
      });
   },

   /**
    * Soft delete application
    */
   async delete(appId, reason = null) {
      const queryParams = reason ? `?reason=${encodeURIComponent(reason)}` : '';
      return await apiFetch(`/applications/${appId}${queryParams}`, {
         method: 'DELETE'
      });
   },

   /**
    * Reactivate deleted application
    */
   async reactivate(appId) {
      return await apiFetch(`/applications/${appId}/reactivate`, {
         method: 'POST'
      });
   },

   /**
    * Validate registration (dry-run)
    */
   async validate(data) {
      return await apiFetch('/applications/validate', {
         method: 'POST',
         body: data
      });
   },

   /**
    * Verify container exists
    */
   async verifyContainer(appId) {
      return await apiFetch(`/applications/${appId}/verify-container`);
   },

   /**
    * Get application history
    */
   async getHistory(appId, params = {}) {
      const { limit = 50, offset = 0 } = params;
      const queryParams = new URLSearchParams({ limit, offset });
      return await apiFetch(`/applications/${appId}/history?${queryParams}`);
   }
};

// Export
const API = {
   applications: ApplicationAPI,

   // Health check for API
   async healthCheck() {
      try {
         const response = await fetch(`${API_BASE_URL.replace('/api/v1', '')}/docs`);
         return response.ok;
      } catch {
         return false;
      }
   }
};

console.log('API service loaded - Base URL:', API_BASE_URL);

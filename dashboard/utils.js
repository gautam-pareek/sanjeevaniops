/* ============================================================================
   SanjeevaniOps Dashboard - Utility Functions
   Helper functions for common tasks
   ============================================================================ */

// Date and time formatting
const DateUtils = {
   /**
    * Format ISO datetime to human-readable format
    */
   formatDateTime(isoString) {
      if (!isoString) return 'N/A';
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
         year: 'numeric',
         month: 'short',
         day: 'numeric',
         hour: '2-digit',
         minute: '2-digit'
      });
   },

   /**
    * Format ISO date only
    */
   formatDate(isoString) {
      if (!isoString) return 'N/A';
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
         year: 'numeric',
         month: 'short',
         day: 'numeric'
      });
   },

   /**
    * Get relative time (e.g., "2 hours ago")
    */
   getRelativeTime(isoString) {
      if (!isoString) return 'N/A';
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return 'just now';
      if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
      if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
      if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
      return this.formatDate(isoString);
   }
};

// String utilities
const StringUtils = {
   /**
    * Truncate string to max length
    */
   truncate(str, maxLength = 50) {
      if (!str || str.length <= maxLength) return str;
      return str.substring(0, maxLength) + '...';
   },

   /**
    * Capitalize first letter
    */
   capitalize(str) {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
   },

   /**
    * Convert snake_case to Title Case
    */
   toTitleCase(str) {
      if (!str) return '';
      return str
         .split('_')
         .map(word => this.capitalize(word))
         .join(' ');
   },

   /**
    * Generate short ID from long UUID
    */
   shortId(uuid) {
      if (!uuid) return '';
      return uuid.substring(0, 8);
   }
};

// Object utilities
const ObjectUtils = {
   /**
    * Deep clone an object
    */
   deepClone(obj) {
      return JSON.parse(JSON.stringify(obj));
   },

   /**
    * Check if object is empty
    */
   isEmpty(obj) {
      return !obj || Object.keys(obj).length === 0;
   },

   /**
    * Get nested property safely
    */
   getNestedValue(obj, path, defaultValue = null) {
      const keys = path.split('.');
      let result = obj;

      for (const key of keys) {
         if (result && typeof result === 'object' && key in result) {
            result = result[key];
         } else {
            return defaultValue;
         }
      }

      return result;
   }
};

// Performance utilities
const PerfUtils = {
   /**
    * Debounce function
    */
   debounce(func, wait = 300) {
      let timeout;
      return function executedFunction(...args) {
         const later = () => {
            clearTimeout(timeout);
            func(...args);
         };
         clearTimeout(timeout);
         timeout = setTimeout(later, wait);
      };
   },

   /**
    * Throttle function
    */
   throttle(func, limit = 300) {
      let inThrottle;
      return function executedFunction(...args) {
         if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
         }
      };
   }
};

// DOM utilities
const DOMUtils = {
   /**
    * Escape HTML to prevent XSS
    */
   escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
   },

   /**
    * Create element from HTML string
    */
   createElementFromHTML(htmlString) {
      const div = document.createElement('div');
      div.innerHTML = htmlString.trim();
      return div.firstChild;
   },

   /**
    * Scroll to element smoothly
    */
   scrollToElement(element) {
      if (element) {
         element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
   }
};

// Storage utilities
const StorageUtils = {
   /**
    * Get item from localStorage with JSON parsing
    */
   get(key, defaultValue = null) {
      try {
         const item = localStorage.getItem(key);
         return item ? JSON.parse(item) : defaultValue;
      } catch {
         return defaultValue;
      }
   },

   /**
    * Set item in localStorage with JSON stringification
    */
   set(key, value) {
      try {
         localStorage.setItem(key, JSON.stringify(value));
         return true;
      } catch {
         return false;
      }
   },

   /**
    * Remove item from localStorage
    */
   remove(key) {
      localStorage.removeItem(key);
   }
};

// Validation utilities
const ValidationUtils = {
   /**
    * Validate URL format
    */
   isValidURL(str) {
      try {
         new URL(str);
         return true;
      } catch {
         return false;
      }
   },

   /**
    * Validate port number
    */
   isValidPort(port) {
      const num = parseInt(port, 10);
      return !isNaN(num) && num >= 1 && num <= 65535;
   },

   /**
    * Validate application name format
    */
   isValidAppName(name) {
      const pattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
      return pattern.test(name);
   }
};

// Copy to clipboard
const ClipboardUtils = {
   /**
    * Copy text to clipboard
    */
   async copy(text) {
      try {
         await navigator.clipboard.writeText(text);
         return true;
      } catch {
         // Fallback for older browsers
         const textArea = document.createElement('textarea');
         textArea.value = text;
         textArea.style.position = 'fixed';
         textArea.style.left = '-999999px';
         document.body.appendChild(textArea);
         textArea.select();
         try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
         } catch {
            document.body.removeChild(textArea);
            return false;
         }
      }
   }
};

// JSON diff for history comparison
const DiffUtils = {
   /**
    * Simple JSON diff - returns changed keys
    */
   compareObjects(obj1, obj2) {
      const changes = {};
      const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);

      for (const key of allKeys) {
         const val1 = obj1?.[key];
         const val2 = obj2?.[key];

         if (JSON.stringify(val1) !== JSON.stringify(val2)) {
            changes[key] = {
               old: val1,
               new: val2
            };
         }
      }

      return changes;
   },

   /**
    * Format diff for display
    */
   formatDiff(changes) {
      const lines = [];
      for (const [key, value] of Object.entries(changes)) {
         lines.push(`<strong>${key}:</strong>`);
         if (value.old !== undefined) {
            lines.push(`  <span class="text-error">- ${JSON.stringify(value.old)}</span>`);
         }
         if (value.new !== undefined) {
            lines.push(`  <span class="text-success">+ ${JSON.stringify(value.new)}</span>`);
         }
      }
      return lines.join('<br>');
   }
};

// Export utilities
const Utils = {
   date: DateUtils,
   string: StringUtils,
   object: ObjectUtils,
   perf: PerfUtils,
   dom: DOMUtils,
   storage: StorageUtils,
   validation: ValidationUtils,
   clipboard: ClipboardUtils,
   diff: DiffUtils
};

console.log('Utils loaded');

/**
 * UI Components & Interactions
 *
 * Functions for common UI patterns:
 * - Toast notifications
 * - Modals
 * - Password visibility toggle
 * - Loading states
 */

/* ===================
   DOM HELPERS
   =================== */

/**
 * Create an element with safe text content and attributes
 * @param {string} tag - HTML tag (e.g., 'div', 'span')
 * @param {Object} attributes - Key-value pairs for attributes (e.g., { class: 'btn', id: 'myBtn' })
 * @param {string|Array<HTMLElement|string>} children - Text content or array of children elements/text
 * @returns {HTMLElement} - The created element
 */
export function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);

  // Set attributes
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className' || key === 'class') {
        element.className = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(element.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(element.dataset, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        // Event listeners (e.g., onclick)
        element.addEventListener(key.substring(2).toLowerCase(), value);
      } else {
        element.setAttribute(key, value);
      }
    });
  }

  // Set content/children
  if (children) {
    if (!Array.isArray(children)) {
      children = [children];
    }

    children.forEach(child => {
      if (child instanceof Node) {
        element.appendChild(child);
      } else if (child !== null && child !== undefined) {
        // Treat strings/numbers as text content (safe from XSS)
        element.appendChild(document.createTextNode(String(child)));
      }
    });
  }

  return element;
}

/* ===================
   TOAST NOTIFICATIONS
   =================== */

/**
 * Show a toast notification
 *
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'warning', 'info'
 * @param {number} duration - How long to show (ms)
 *
 * @example
 * showToast('Order created!', 'success');
 * showToast('Something went wrong', 'error', 5000);
 */
export function showToast(message, type = 'success', duration = 3000) {
  // Get or create toast element
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  // Clear any existing timeout (stored on element to avoid module-level state conflicts)
  if (toast._hideTimeout) {
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = null;
  }

  // Remove existing type classes
  toast.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info', 'show');

  // Set message and type
  toast.textContent = message;
  toast.classList.add(`toast-${type}`);

  // Show toast
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Auto-hide after duration
  toast._hideTimeout = setTimeout(() => {
    hideToast();
  }, duration);
}

/**
 * Hide the toast notification
 */
export function hideToast() {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.classList.remove('show');
  }
}

/**
 * Show a success toast (shortcut)
 */
export function showSuccess(message, duration = 3000) {
  showToast(message, 'success', duration);
}

/**
 * Show an info toast for issues (soft notification instead of error)
 */
export function showError(message, duration = 4000) {
  showToast(message, 'info', duration);
}

/**
 * Show a warning toast (shortcut)
 */
export function showWarning(message, duration = 3500) {
  showToast(message, 'warning', duration);
}

/* ===================
   MODAL MANAGEMENT
   =================== */

/**
 * Open a modal
 *
 * @param {string} modalId - ID of the modal overlay element
 *
 * @example
 * openModal('order-modal');
 */
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  }
}

/**
 * Close a modal
 *
 * @param {string} modalId - ID of the modal overlay element
 */
export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = ''; // Restore scrolling
  }
}

/**
 * Close modal when clicking overlay (outside the modal content)
 * Call this once during page init
 *
 * @param {string} modalId - ID of the modal overlay element
 */
export function setupModalCloseOnOverlay(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modalId);
      }
    });
  }
}

/**
 * Close modal on Escape key
 * Call this once during page init (idempotent - safe to call multiple times)
 */
let _escapeListenerRegistered = false;
export function setupModalCloseOnEscape() {
  if (_escapeListenerRegistered) return;
  _escapeListenerRegistered = true;

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal-overlay.show');
      if (openModals.length === 0) return;
      // Use page's closeModal if available (handles unsaved changes warnings)
      if (typeof window.closeModal === 'function') {
        window.closeModal();
      } else {
        openModals.forEach(modal => {
          modal.classList.remove('show');
        });
        document.body.style.overflow = '';
      }
    }
  });
}

/* ===================
   PASSWORD VISIBILITY
   =================== */

/**
 * Toggle password visibility
 *
 * @param {string} inputId - ID of the password input
 * @param {HTMLElement} buttonEl - The toggle button element
 */
export function togglePassword(inputId, buttonEl) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.type === 'password') {
    input.type = 'text';
    if (buttonEl) buttonEl.textContent = '○';
  } else {
    input.type = 'password';
    if (buttonEl) buttonEl.textContent = '◉';
  }
}

/* ===================
   LOADING STATES
   =================== */

/**
 * Set a button to loading state
 *
 * @param {HTMLElement} button - Button element
 * @param {boolean} loading - Whether to show loading state
 * @param {string} loadingText - Text to show while loading
 */
export function setButtonLoading(button, loading = true, loadingText = 'Loading...') {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || 'Submit';
    button.disabled = false;
  }
}

/* ===================
   FORM HELPERS
   =================== */

/**
 * Clear all form inputs
 *
 * @param {HTMLFormElement|string} form - Form element or ID
 */
export function clearForm(form) {
  const formEl = typeof form === 'string' ? document.getElementById(form) : form;
  if (formEl) {
    formEl.reset();
  }
}

/**
 * Get form data as an object
 *
 * @param {HTMLFormElement|string} form - Form element or ID
 * @returns {Object} - Form data as key-value pairs
 */
export function getFormData(form) {
  const formEl = typeof form === 'string' ? document.getElementById(form) : form;
  if (!formEl) return {};

  const formData = new FormData(formEl);
  const data = {};
  for (const [key, value] of formData) {
    data[key] = value;
  }
  return data;
}

/* ===================
   SCROLL HELPERS
   =================== */

/**
 * Scroll to top of page smoothly
 */
export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Scroll to an element
 *
 * @param {string|HTMLElement} element - Element or selector
 */
export function scrollToElement(element) {
  const el = typeof element === 'string' ? document.querySelector(element) : element;
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ===================
   CONFIRMATION DIALOG
   =================== */

/**
 * Show a confirmation dialog
 *
 * @param {string} message - Confirmation message
 * @returns {boolean} - True if confirmed
 */
export function confirm(message) {
  return window.confirm(message);
}

/* ===================
   COPY TO CLIPBOARD
   =================== */

/**
 * Copy text to clipboard
 *
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} - True if successful
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard!');
    return true;
  } catch (e) {
    console.debug('Clipboard copy failed:', e.message);
    showToast('Could not copy to clipboard', 'info');
    return false;
  }
}

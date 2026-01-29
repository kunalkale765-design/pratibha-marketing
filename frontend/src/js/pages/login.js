import { togglePassword } from '/js/ui.js';
import { registerServiceWorker } from '/js/init.js';

// Initialize
registerServiceWorker();

// Wait for Auth to be available (loaded from auth.js module)
const waitForAuth = (maxWait = 10000) => new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
        if (window.Auth) return resolve(window.Auth);
        if (Date.now() - startTime > maxWait) return reject(new Error('Auth not available'));
        setTimeout(check, 50);
    };
    check();
});
const Auth = await waitForAuth();

// Pre-fetch CSRF token to ensure it's ready before form submission
Auth.ensureCsrfToken().catch(err => console.warn('CSRF pre-fetch failed:', err));

// Elements
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const noticeMessage = document.getElementById('noticeMessage');
const passwordToggle = document.getElementById('passwordToggle');

// Password visibility toggle
if (passwordToggle) {
    passwordToggle.addEventListener('click', () => {
        togglePassword('password', passwordToggle);
    });
}

// Check if already logged in
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            if (data.user.role === 'customer') {
                window.location.href = '/pages/order-form/';
            } else if (data.user.role === 'staff') {
                window.location.href = '/pages/staff-dashboard/';
            } else {
                window.location.href = '/';
            }
        }
    } catch (_error) {
        // Not logged in - stay on login page
    }
}

// Form submission
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showNotice('Please enter username and password');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.classList.add('btn-loading');
        hideNotice();

        try {
            const headers = { 'Content-Type': 'application/json' };
            // Ensure CSRF token is available (fetches from server if missing)
            const csrfToken = await Auth.ensureCsrfToken();
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            // Handle rate limiting (429)
            if (response.status === 429) {
                showNotice('Too many attempts. Please try again later.');
                return;
            }

            const data = await response.json();

            // Handle CSRF error with automatic retry
            if (response.status === 403 && data?.message?.toLowerCase().includes('csrf')) {
                console.log('CSRF error, refreshing token and retrying...');
                const newToken = await Auth.refreshCsrfToken();
                if (newToken) {
                    headers['X-CSRF-Token'] = newToken;
                    const retryResponse = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers,
                        credentials: 'include',
                        body: JSON.stringify({ email, password })
                    });
                    const retryData = await retryResponse.json();
                    if (retryResponse.ok) {
                        Auth.setUser(retryData.user);  // Use Auth.setUser to filter sensitive data
                        if (retryData.user.role === 'customer') {
                            window.location.href = '/pages/order-form/';
                        } else if (retryData.user.role === 'staff') {
                            window.location.href = '/pages/staff-dashboard/';
                        } else {
                            window.location.href = '/';
                        }
                        return;
                    }
                    showNotice(retryData.message || 'Please check your credentials');
                    return;
                }
            }

            if (response.ok) {
                Auth.setUser(data.user);  // Use Auth.setUser to filter sensitive data
                if (data.user.role === 'customer') {
                    window.location.href = '/pages/order-form/';
                } else if (data.user.role === 'staff') {
                    window.location.href = '/pages/staff-dashboard/';
                } else {
                    window.location.href = '/';
                }
            } else {
                showNotice(data.message || 'Please check your credentials');
            }
        } catch (error) {
            console.error('Login error:', error);
            if (!navigator.onLine) {
                showNotice('No internet connection');
            } else if (error.name === 'TypeError' || error.message.includes('fetch')) {
                showNotice('Connection issue. Please try again.');
            } else {
                showNotice('Something went wrong. Try again.');
            }
        } finally {
            if (loginBtn) {
                loginBtn.disabled = false;
                loginBtn.classList.remove('btn-loading');
            }
        }
    });
}

function showNotice(message) {
    if (noticeMessage) {
        noticeMessage.textContent = message;
        noticeMessage.classList.add('show');
    }
}

function hideNotice() {
    if (noticeMessage) {
        noticeMessage.classList.remove('show');
    }
}

// Forgot password handler
const forgotLink = document.getElementById('forgotPasswordLink');
if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();

        if (!email) {
            showNotice('Please enter your username first');
            return;
        }

        try {
            const headers = { 'Content-Type': 'application/json' };
            const csrfToken = await Auth.ensureCsrfToken();
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (response.ok && data.resetUrl) {
                // For development: show the reset link
                // In production with email, this would just show a success message
                // Use DOM methods to prevent XSS (don't use innerHTML with user data)
                noticeMessage.textContent = '';
                noticeMessage.appendChild(document.createTextNode('Reset link generated! '));
                const link = document.createElement('a');
                link.href = data.resetUrl;
                link.style.cssText = 'color: var(--dusty-olive); text-decoration: underline;';
                link.textContent = 'Click here to reset';
                noticeMessage.appendChild(link);
                noticeMessage.classList.add('show');
                noticeMessage.classList.remove('error');
            } else {
                showNotice(data.message || 'If an account exists, a reset link has been generated');
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            showNotice('Could not process request. Try again.');
        }
    });
}

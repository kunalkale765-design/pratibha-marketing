import { togglePassword } from '/js/ui.js';
import { registerServiceWorker } from '/js/init.js';

// Initialize
registerServiceWorker();

// Wait for Auth to be available (loaded from auth.js module)
const waitForAuth = () => new Promise((resolve) => {
    if (window.Auth) {
        resolve(window.Auth);
    } else {
        // Retry after a short delay
        setTimeout(() => resolve(waitForAuth()), 10);
    }
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
                        localStorage.setItem('user', JSON.stringify(retryData.user));
                        if (retryData.user.role === 'customer') {
                            window.location.href = '/pages/order-form/';
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
                localStorage.setItem('user', JSON.stringify(data.user));
                if (data.user.role === 'customer') {
                    window.location.href = '/pages/order-form/';
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
                noticeMessage.innerHTML = `Reset link generated! <a href="${data.resetUrl}" style="color: var(--dusty-olive); text-decoration: underline;">Click here to reset</a>`;
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

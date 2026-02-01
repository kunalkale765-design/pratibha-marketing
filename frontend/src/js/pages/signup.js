import { registerServiceWorker } from '/js/init.js';

// Initialize
registerServiceWorker();

import { waitForAuth } from '/js/helpers/auth-wait.js';
const Auth = await waitForAuth();

// Pre-fetch CSRF token to ensure it's ready before form submission
Auth.ensureCsrfToken().catch(err => console.warn('CSRF pre-fetch failed:', err));

// Elements
const signupForm = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');
const noticeMessage = document.getElementById('noticeMessage');
const successMessage = document.getElementById('successMessage');
const password = document.getElementById('password');

// Password requirement validation
if (password) {
    password.addEventListener('input', function () {
        const val = this.value;
        updateRequirement('req-length', val.length >= 6);
        updateRequirement('req-upper', /[A-Z]/.test(val));
        updateRequirement('req-lower', /[a-z]/.test(val));
        updateRequirement('req-number', /[0-9]/.test(val));
    });
}

function updateRequirement(id, valid) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent.substring(2);
    if (valid) {
        el.classList.add('valid');
        el.textContent = '✓ ' + text;
    } else {
        el.classList.remove('valid');
        el.textContent = '◯ ' + text;
    }
}

// Check if already logged in
checkAuth();

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            const role = data?.user?.role;
            if (role === 'customer') {
                window.location.href = '/pages/order-form/';
            } else if (role === 'staff') {
                window.location.href = '/pages/staff-dashboard/';
            } else if (role) {
                window.location.href = '/';
            }
        }
    } catch (_error) {
        // Not logged in - stay on signup page
    }
}

// Form submission
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const passwordVal = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validation
        if (!name || !email || !passwordVal || !confirmPassword) {
            showNotice('Please complete all required fields');
            return;
        }

        if (passwordVal.length < 6) {
            showNotice('Password needs at least 6 characters');
            return;
        }

        if (!/[A-Z]/.test(passwordVal)) {
            showNotice('Add an uppercase letter to password');
            return;
        }

        if (!/[a-z]/.test(passwordVal)) {
            showNotice('Add a lowercase letter to password');
            return;
        }

        if (!/[0-9]/.test(passwordVal)) {
            showNotice('Add a number to password');
            return;
        }

        if (passwordVal !== confirmPassword) {
            showNotice('Passwords don\'t match');
            return;
        }

        if (phone && !/^[0-9]{10}$/.test(phone)) {
            showNotice('Phone should be 10 digits');
            return;
        }

        signupBtn.disabled = true;
        signupBtn.textContent = 'Creating account...';
        hideAllMessages();

        try {
            const userData = { name, email, password: passwordVal, role: 'customer' };
            if (phone) userData.phone = phone;

            const headers = { 'Content-Type': 'application/json' };
            // Ensure CSRF token is available (fetches from server if missing)
            const csrfToken = await Auth.ensureCsrfToken();
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            // Handle CSRF error with automatic retry
            if (response.status === 403 && data?.message?.toLowerCase().includes('csrf')) {
                console.log('CSRF error, refreshing token and retrying...');
                const newToken = await Auth.refreshCsrfToken();
                if (newToken) {
                    headers['X-CSRF-Token'] = newToken;
                    const retryResponse = await fetch('/api/auth/register', {
                        method: 'POST',
                        headers,
                        credentials: 'include',
                        body: JSON.stringify(userData)
                    });
                    const retryData = await retryResponse.json();
                    if (retryResponse.ok && retryData?.user) {
                        Auth.setUser(retryData.user);
                        showSuccess('Account created successfully! Redirecting...');
                        const role = retryData.user.role;
                        setTimeout(() => {
                            if (role === 'customer') {
                                window.location.href = '/pages/order-form/';
                            } else if (role === 'staff') {
                                window.location.href = '/pages/staff-dashboard/';
                            } else {
                                window.location.href = '/';
                            }
                        }, 1500);
                        return;
                    }
                    if (retryData.errors && retryData.errors.length > 0) {
                        showNotice(retryData.errors.map(e => e.msg).join(', '));
                    } else {
                        showNotice(retryData.message || 'Could not create account. Try again.');
                    }
                    return;
                }
            }

            if (response.ok && data?.user) {
                Auth.setUser(data.user);
                showSuccess('Account created successfully! Redirecting...');
                const role = data.user.role;
                setTimeout(() => {
                    if (role === 'customer') {
                        window.location.href = '/pages/order-form/';
                    } else if (role === 'staff') {
                        window.location.href = '/pages/staff-dashboard/';
                    } else {
                        window.location.href = '/';
                    }
                }, 1500);
            } else {
                if (data?.errors && data.errors.length > 0) {
                    showNotice(data.errors.map(e => e.msg).join(', '));
                } else {
                    showNotice(data?.message || 'Could not create account. Try again.');
                }
            }
        } catch (error) {
            console.error('Signup error:', error);
            if (!navigator.onLine) {
                showNotice('No internet connection');
            } else if (error.name === 'TypeError' || error.message.includes('fetch')) {
                showNotice('Connection issue. Please try again.');
            } else {
                showNotice('Something went wrong. Try again.');
            }
        } finally {
            if (signupBtn) {
                signupBtn.disabled = false;
                signupBtn.textContent = 'Create Account';
            }
        }
    });
}

function showNotice(message) {
    if (noticeMessage) {
        noticeMessage.textContent = message;
        noticeMessage.classList.add('show');
        if (successMessage) successMessage.classList.remove('show');
    }
}

function showSuccess(message) {
    if (successMessage) {
        successMessage.textContent = message;
        successMessage.classList.add('show');
        if (noticeMessage) noticeMessage.classList.remove('show');
    }
}

function hideAllMessages() {
    if (noticeMessage) noticeMessage.classList.remove('show');
    if (successMessage) successMessage.classList.remove('show');
}

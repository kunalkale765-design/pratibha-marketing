
import { showToast, createElement } from '/js/ui.js';

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

let allUsers = [];
let selectedRole = '';
let showInactive = false;
let showTestUsers = false;
let formDirty = false;

async function init() {
    Auth.ensureCsrfToken().catch(err => console.warn('CSRF pre-fetch failed:', err));
    const user = await Auth.requireAuth(['admin']);
    if (!user) return;
    await loadUsers();
}

async function loadUsers() {
    try {
        const params = new URLSearchParams();
        if (showInactive) params.set('isActive', 'all');
        if (showTestUsers) params.set('includeTest', 'true');
        const url = '/api/users' + (params.toString() ? '?' + params : '');
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.message || `Server returned ${res.status}`);
        }
        const data = await res.json();
        allUsers = data.data || [];
        displayUsers(filterUsers());
    } catch (e) {
        console.error('Failed to load users:', e);
        const container = document.getElementById('usersList');
        const errorMsg = !navigator.onLine ? 'No internet connection' : (e.message || 'Users not available');
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, [
            createElement('p', {}, errorMsg),
            createElement('button', {
                style: { marginTop: '1rem', padding: '0.5rem 1rem', background: 'var(--dusty-olive)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
                onclick: loadUsers
            }, 'Try Again')
        ]));
    }
}

function filterUsers() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    return allUsers.filter(u => {
        const matchesSearch = u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.phone && u.phone.includes(q));
        const matchesRole = !selectedRole || u.role === selectedRole;
        return matchesSearch && matchesRole;
    });
}

function getRoleBadge(role) {
    const labels = { admin: 'Admin', staff: 'Staff', customer: 'Customer' };
    return createElement('span', { className: `badge badge-${role}` }, labels[role] || role);
}

function displayUsers(users) {
    const container = document.getElementById('usersList');
    if (!users || !users.length) {
        container.innerHTML = '';
        container.appendChild(createElement('div', { className: 'empty-state' }, 'No users found'));
        return;
    }

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    users.forEach((u, idx) => {
        const badges = [getRoleBadge(u.role)];
        if (!u.isActive) {
            badges.push(createElement('span', { className: 'badge badge-inactive' }, 'Inactive'));
        }

        const details = [];
        details.push(createElement('span', { className: 'user-email' }, u.email));
        if (u.phone) details.push(createElement('span', {}, u.phone));

        const actions = [];
        actions.push(createElement('button', {
            onclick: () => window.editUserById(u._id),
            className: 'btn-action primary'
        }, 'Edit'));
        actions.push(createElement('button', {
            onclick: () => window.openResetPassword(u._id),
            className: 'btn-action'
        }, 'Password'));

        if (u.isActive) {
            actions.push(createElement('button', {
                onclick: () => window.deactivateUser(u._id),
                className: 'btn-action danger'
            }, 'Deactivate'));
        } else {
            actions.push(createElement('button', {
                onclick: () => window.activateUser(u._id),
                className: 'btn-action link'
            }, 'Activate'));
        }

        const card = createElement('div', {
            className: `customer-card card-animated card-fade-in${!u.isActive ? ' inactive' : ''}`,
            style: { animationDelay: `${idx * 0.05}s` }
        }, [
            createElement('div', { className: 'customer-header' }, [
                createElement('div', { className: 'customer-name' }, u.name),
                createElement('div', { className: 'customer-badges' }, badges)
            ]),
            createElement('div', { className: 'customer-details' }, details),
            createElement('div', { className: 'customer-actions' }, actions)
        ]);
        fragment.appendChild(card);
    });

    container.appendChild(fragment);
}

function searchUsers() {
    displayUsers(filterUsers());
}

function filterByRole(role) {
    selectedRole = role;
    document.querySelectorAll('.role-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.role === role);
    });
    displayUsers(filterUsers());
}

function toggleInactive() {
    showInactive = document.getElementById('showInactive').checked;
    loadUsers();
}

function toggleTestUsers() {
    showTestUsers = document.getElementById('showTestUsers').checked;
    loadUsers();
}

function showAddUserForm() {
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('userRole').value = 'staff';
    document.getElementById('passwordGroup').classList.remove('hidden');
    document.getElementById('userPassword').required = true;
    document.getElementById('userModal').classList.add('show');
    setTimeout(() => { formDirty = false; }, 0);
}

function editUser(user) {
    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user._id;
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userPhone').value = user.phone || '';
    document.getElementById('userRole').value = user.role;
    // Hide password field when editing - use separate reset password flow
    document.getElementById('passwordGroup').classList.add('hidden');
    document.getElementById('userPassword').required = false;
    document.getElementById('userPassword').value = '';
    document.getElementById('userModal').classList.add('show');
    setTimeout(() => { formDirty = false; }, 0);
}

function editUserById(id) {
    const user = allUsers.find(u => u._id === id);
    if (user) editUser(user);
}

function closeModal() {
    if (formDirty && !confirm('You have unsaved changes. Discard them?')) return;
    formDirty = false;
    document.getElementById('userModal').classList.remove('show');
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
    } else {
        input.type = 'password';
        btn.textContent = 'Show';
    }
}

// Reset Password
function openResetPassword(userId) {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;
    document.getElementById('passwordUserId').value = userId;
    document.getElementById('passwordUserName').textContent = `${user.name} (${user.email})`;
    document.getElementById('newPassword').value = '';
    document.getElementById('passwordModal').classList.add('show');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('show');
}

async function fetchWithCsrf(url, options) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const csrfToken = await Auth.ensureCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    let res = await fetch(url, { ...options, headers, credentials: 'include' });

    // CSRF retry
    if (res.status === 403) {
        const err = await res.json();
        if (err.message?.toLowerCase().includes('csrf')) {
            const newToken = await Auth.refreshCsrfToken();
            if (newToken) {
                headers['X-CSRF-Token'] = newToken;
                res = await fetch(url, { ...options, headers, credentials: 'include' });
            }
        } else {
            return { res, data: err, csrfFailed: false };
        }
    }

    const data = await res.json();
    return { res, data };
}

// Deactivate / Activate
async function deactivateUser(id) {
    if (!confirm('Deactivate this user? They will not be able to login.')) return;
    try {
        const { res, data } = await fetchWithCsrf(`/api/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('User deactivated', 'success');
            loadUsers();
        } else {
            showToast(data.message || 'Could not deactivate', 'info');
        }
    } catch (e) {
        console.error('Deactivate error:', e);
        showToast(!navigator.onLine ? 'No internet connection' : 'Could not deactivate. Try again.', 'info');
    }
}

async function activateUser(id) {
    try {
        const { res, data } = await fetchWithCsrf(`/api/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: true })
        });
        if (res.ok) {
            showToast('User activated', 'success');
            loadUsers();
        } else {
            showToast(data.message || 'Could not activate', 'info');
        }
    } catch (e) {
        console.error('Activate error:', e);
        showToast(!navigator.onLine ? 'No internet connection' : 'Could not activate. Try again.', 'info');
    }
}

// Setup form listeners
function setupFormListeners() {
    const form = document.getElementById('userForm');
    if (form) {
        form.addEventListener('input', () => { formDirty = true; });
        form.addEventListener('change', () => { formDirty = true; });
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('saveUserBtn');
            const id = document.getElementById('userId').value;

            const name = document.getElementById('userName').value.trim();
            const email = document.getElementById('userEmail').value.trim();
            const password = document.getElementById('userPassword').value;
            const phone = document.getElementById('userPhone').value.trim();
            const role = document.getElementById('userRole').value;

            if (!name) { showToast('Please enter name', 'info'); return; }
            if (!email || email.length < 3) { showToast('Username must be at least 3 characters', 'info'); return; }
            if (phone && !/^[0-9]{10}$/.test(phone)) { showToast('Phone should be 10 digits', 'info'); return; }

            // Password validation for new users
            if (!id && !password) { showToast('Password is required', 'info'); return; }
            if (password) {
                if (password.length < 6) { showToast('Password must be at least 6 characters', 'info'); return; }
                if (!/[A-Z]/.test(password)) { showToast('Password needs an uppercase letter', 'info'); return; }
                if (!/[a-z]/.test(password)) { showToast('Password needs a lowercase letter', 'info'); return; }
                if (!/[0-9]/.test(password)) { showToast('Password needs a number', 'info'); return; }
            }

            btn.classList.add('btn-loading');
            btn.disabled = true;

            const bodyData = { name, email, phone, role };
            if (!id && password) bodyData.password = password;

            try {
                const url = id ? `/api/users/${id}` : '/api/users';
                const method = id ? 'PUT' : 'POST';
                const { res, data } = await fetchWithCsrf(url, { method, body: JSON.stringify(bodyData) });

                if (res.ok) {
                    btn.classList.remove('btn-loading');
                    btn.classList.add('btn-success');
                    showToast(id ? 'User updated' : 'User created', 'success');
                    setTimeout(() => {
                        btn.classList.remove('btn-success');
                        formDirty = false;
                        document.getElementById('userModal').classList.remove('show');
                    }, 800);
                    loadUsers();
                } else {
                    const msg = data.errors?.[0]?.msg || data.message || 'Could not save. Try again.';
                    showToast(msg, 'info');
                }
            } catch (e) {
                console.error('Save user error:', e);
                showToast(!navigator.onLine ? 'No internet connection' : 'Could not save. Try again.', 'info');
            } finally {
                btn.classList.remove('btn-loading');
                btn.disabled = false;
            }
        });
    }

    // Password reset form
    const pwForm = document.getElementById('passwordForm');
    if (pwForm) {
        pwForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('savePasswordBtn');
            const userId = document.getElementById('passwordUserId').value;
            const password = document.getElementById('newPassword').value;

            if (!password) { showToast('Please enter new password', 'info'); return; }
            if (password.length < 6) { showToast('Password must be at least 6 characters', 'info'); return; }
            if (!/[A-Z]/.test(password)) { showToast('Password needs an uppercase letter', 'info'); return; }
            if (!/[a-z]/.test(password)) { showToast('Password needs a lowercase letter', 'info'); return; }
            if (!/[0-9]/.test(password)) { showToast('Password needs a number', 'info'); return; }

            btn.classList.add('btn-loading');
            btn.disabled = true;

            try {
                const { res, data } = await fetchWithCsrf(`/api/users/${userId}/password`, {
                    method: 'PUT',
                    body: JSON.stringify({ password })
                });

                if (res.ok) {
                    btn.classList.remove('btn-loading');
                    btn.classList.add('btn-success');
                    showToast('Password reset successfully', 'success');
                    setTimeout(() => {
                        btn.classList.remove('btn-success');
                        closePasswordModal();
                    }, 800);
                } else {
                    const msg = data.errors?.[0]?.msg || data.message || 'Could not reset password';
                    showToast(msg, 'info');
                }
            } catch (e) {
                console.error('Password reset error:', e);
                showToast(!navigator.onLine ? 'No internet connection' : 'Could not reset. Try again.', 'info');
            } finally {
                btn.classList.remove('btn-loading');
                btn.disabled = false;
            }
        });
    }
}

// Expose to window
window.showAddUserForm = showAddUserForm;
window.searchUsers = searchUsers;
window.filterByRole = filterByRole;
window.toggleInactive = toggleInactive;
window.toggleTestUsers = toggleTestUsers;
window.closeModal = closeModal;
window.editUserById = editUserById;
window.openResetPassword = openResetPassword;
window.closePasswordModal = closePasswordModal;
window.deactivateUser = deactivateUser;
window.activateUser = activateUser;
window.togglePasswordVisibility = togglePasswordVisibility;

// Modal overlay click handlers
const userModal = document.getElementById('userModal');
if (userModal) {
    userModal.onclick = (e) => { if (e.target.id === 'userModal') closeModal(); };
}
const passwordModal = document.getElementById('passwordModal');
if (passwordModal) {
    passwordModal.onclick = (e) => { if (e.target.id === 'passwordModal') closePasswordModal(); };
}

setupFormListeners();
init();

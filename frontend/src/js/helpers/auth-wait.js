/**
 * Wait for the Auth module to be available on window.
 * Used by all page scripts to ensure Auth is loaded before proceeding.
 */
export const waitForAuth = (maxWait = 10000) => new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
        if (window.Auth) return resolve(window.Auth);
        if (Date.now() - startTime > maxWait) return reject(new Error('Auth not available'));
        setTimeout(check, 50);
    };
    check();
});

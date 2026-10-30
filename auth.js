(function () {
    'use strict';

    let activeUserId = null;
    let appInitialized = false;
    let recoveryMode = false;
    let animationFrame = null;
    let resizeHandler = null;

    document.addEventListener('DOMContentLoaded', initialize);

    async function initialize() {
        const client = window.supabase;
        const authScreen = document.getElementById('auth-screen');
        const appShell = document.getElementById('app-shell');
        if (!client?.auth || !authScreen || !appShell) {
            setMessage('The sign-in service is unavailable. Check your connection and reload the page.', true);
            return;
        }

        document.getElementById('login-form').addEventListener('submit', signIn);
        document.getElementById('password-recovery-form').addEventListener('submit', updatePassword);
        document.getElementById('forgot-password').addEventListener('click', resetPassword);
        document.getElementById('toggle-password').addEventListener('click', togglePassword);
        document.getElementById('sign-out-button').addEventListener('click', signOut);
        startMatrix();
        if (/[?&#]type=recovery(?:&|$)/i.test(`${window.location.search}${window.location.hash}`)) {
            setRecoveryMode(true);
        }

        client.auth.onAuthStateChange((eventName, session) => {
            // Leave Supabase's auth callback before making other Supabase calls.
            window.setTimeout(() => applySession(session, eventName), 0);
        });

        const { data, error } = await client.auth.getSession();
        if (error) {
            setMessage('Unable to check your sign-in session. Reload the page to try again.', true);
            return;
        }
        await applySession(data.session, 'INITIAL_SESSION');
    }

    async function applySession(session, eventName) {
        const authScreen = document.getElementById('auth-screen');
        const appShell = document.getElementById('app-shell');
        if (!authScreen || !appShell) return;

        if (eventName === 'PASSWORD_RECOVERY') {
            setRecoveryMode(true);
            window.lockStorageAccess?.();
            window.resetStorageIdentity?.();
            authScreen.hidden = false;
            appShell.hidden = true;
            startMatrix();
            return;
        }
        if (recoveryMode) return;

        if (!session?.user) {
            activeUserId = null;
            if (window.resetStorageIdentity) window.resetStorageIdentity();
            else if (window.lockStorageAccess) window.lockStorageAccess();
            else window.lockStorageVault?.();
            authScreen.hidden = false;
            appShell.hidden = true;
            startMatrix();
            if (eventName === 'SIGNED_OUT') {
                document.getElementById('login-form')?.reset();
                setMessage('You have signed out.', false);
            }
            return;
        }

        authScreen.hidden = true;
        appShell.hidden = false;
        stopMatrix();
        const email = document.getElementById('signed-in-email');
        if (email) email.textContent = session.user.email || 'Signed in';

        if (activeUserId === session.user.id) return;
        if (activeUserId && activeUserId !== session.user.id) {
            if (window.resetStorageIdentity) window.resetStorageIdentity();
            else window.lockStorageAccess?.();
        }
        activeUserId = session.user.id;
        if (!appInitialized) {
            initializeTheme();
            appInitialized = true;
        }
        if (document.getElementById('storage-page')?.classList.contains('active')) {
            window.loadStoragePage?.();
        }
        await loadDashboard();
    }

    async function signIn(event) {
        event.preventDefault();
        const button = document.getElementById('login-submit');
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        button.disabled = true;
        button.classList.add('is-loading');
        button.querySelector('span').textContent = 'Verifying credentials…';
        setMessage('', false);

        try {
            const { error } = await window.supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setMessage('Sign-in failed. Check your email and password, then try again.', true);
                document.getElementById('login-password').select();
                return;
            }
            document.getElementById('login-form').reset();
        } catch (error) {
            setMessage('Sign-in is unavailable right now. Please try again in a moment.', true);
        } finally {
            button.disabled = false;
            button.classList.remove('is-loading');
            button.querySelector('span').textContent = 'Sign in securely';
        }
    }

    async function resetPassword() {
        const input = document.getElementById('login-email');
        const email = input.value.trim();
        if (!email || !input.checkValidity()) {
            input.focus();
            setMessage('Enter a valid email address and we’ll send reset instructions if the account exists.', false);
            return;
        }
        try {
            const { error } = await window.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin
            });
            if (error) throw error;
            setMessage('If the account exists, password reset instructions are on the way.', false);
        } catch (error) {
            setMessage('Password reset is unavailable right now. Please contact your administrator.', true);
        }
    }

    async function updatePassword(event) {
        event.preventDefault();
        const password = document.getElementById('recovery-password').value;
        const confirmation = document.getElementById('recovery-password-confirm').value;
        if (password.length < 12) {
            setRecoveryMessage('Use a password with at least 12 characters.', true);
            return;
        }
        if (password !== confirmation) {
            setRecoveryMessage('The passwords do not match.', true);
            document.getElementById('recovery-password-confirm').focus();
            return;
        }

        const button = document.getElementById('recovery-submit');
        button.disabled = true;
        button.classList.add('is-loading');
        button.querySelector('span').textContent = 'Updating password…';
        setRecoveryMessage('', false);
        try {
            const { error } = await window.supabase.auth.updateUser({ password });
            if (error) throw error;
            const { error: signOutError } = await window.supabase.auth.signOut();
            if (signOutError) throw signOutError;
            recoveryMode = false;
            document.getElementById('password-recovery-form').reset();
            setRecoveryMode(false);
            setMessage('Password updated. Sign in with your new password.', false);
        } catch (error) {
            setRecoveryMessage('Unable to update the password. Request a new reset link and try again.', true);
        } finally {
            button.disabled = false;
            button.classList.remove('is-loading');
            button.querySelector('span').textContent = 'Update password';
        }
    }

    function setRecoveryMode(enabled) {
        recoveryMode = enabled;
        document.getElementById('login-form').hidden = enabled;
        document.getElementById('password-recovery-form').hidden = !enabled;
        document.getElementById('auth-title').textContent = enabled ? 'Choose a new password' : 'Sign in to Datche';
        document.getElementById('auth-description').textContent = enabled
            ? 'Set a strong password of at least 12 characters for your team account.'
            : 'Use your authorized team account to continue.';
        if (enabled) document.getElementById('recovery-password').focus();
    }

    function setRecoveryMessage(message, isError) {
        const element = document.getElementById('recovery-message');
        element.textContent = message;
        element.classList.toggle('is-error', Boolean(isError && message));
        element.classList.toggle('is-visible', Boolean(message));
    }

    function togglePassword() {
        const input = document.getElementById('login-password');
        const button = document.getElementById('toggle-password');
        const showing = input.type === 'password';
        input.type = showing ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(showing));
        button.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
    }

    async function signOut() {
        const button = document.getElementById('sign-out-button');
        button.disabled = true;
        try {
            try {
                await window.supabase.rpc('lock_storage_access');
            } catch (accessError) {
                console.warn('Could not revoke Storage access before sign-out.', accessError);
            }
            const { error } = await window.supabase.auth.signOut();
            if (error) throw error;
        } catch (error) {
            if (typeof showNotification === 'function') {
                showNotification('Unable to sign out. Please try again.', 'error');
            }
        } finally {
            button.disabled = false;
        }
    }

    function setMessage(message, isError) {
        const element = document.getElementById('auth-message');
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', Boolean(isError && message));
        element.classList.toggle('is-visible', Boolean(message));
    }

    function startMatrix() {
        const canvas = document.getElementById('matrix-canvas');
        if (!canvas || animationFrame) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const context = canvas.getContext('2d');
        if (!context) return;

        const glyphs = 'アカサタナハマヤラワ012345789:<>+=*';
        const fontSize = 15;
        let columns = [];
        let width = 0;
        let height = 0;

        const resize = () => {
            const scale = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.floor(width * scale);
            canvas.height = Math.floor(height * scale);
            context.setTransform(scale, 0, 0, scale, 0, 0);
            columns = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * (height / fontSize));
        };

        const render = () => {
            context.fillStyle = 'rgba(3, 10, 8, 0.095)';
            context.fillRect(0, 0, width, height);
            context.font = `${fontSize}px monospace`;
            columns.forEach((position, index) => {
                const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
                context.fillStyle = position * fontSize < fontSize * 2 ? 'rgba(176, 255, 208, .82)' : 'rgba(47, 203, 107, .34)';
                context.fillText(glyph, index * fontSize, position * fontSize);
                columns[index] = position * fontSize > height && Math.random() > 0.975 ? 0 : position + 0.48;
            });
            animationFrame = window.requestAnimationFrame(render);
        };

        resize();
        if (reducedMotion) {
            context.fillStyle = 'rgba(3, 10, 8, 1)';
            context.fillRect(0, 0, width, height);
            context.font = `${fontSize}px monospace`;
            columns.forEach((position, index) => {
                const rowCount = 3 + Math.floor(Math.random() * 18);
                for (let row = 0; row < rowCount; row++) {
                    context.fillStyle = row === 0 ? 'rgba(176, 255, 208, .7)' : 'rgba(47, 203, 107, .25)';
                    context.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], index * fontSize, (position + row) * fontSize);
                }
            });
            return;
        }
        resizeHandler = resize;
        window.addEventListener('resize', resizeHandler, { passive: true });
        render();
    }

    function stopMatrix() {
        if (animationFrame) window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
        if (resizeHandler) window.removeEventListener('resize', resizeHandler);
        resizeHandler = null;
    }
})();

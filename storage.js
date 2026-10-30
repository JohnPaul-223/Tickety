(function () {
    'use strict';

    const BUCKET = 'secure-storage';
    const VAULT_ITERATIONS = 600000;
    const VAULT_IDLE_MS = 15 * 60 * 1000;
    const VAULT_CHECK_TEXT = 'tickety-credential-vault-check-v1';
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let currentUserId = null;
    let vaultConfiguration = null;
    let vaultKey = null;
    let vaultKeyUserId = null;
    let credentialEntries = [];
    let storageFiles = [];
    let storageRenderVersion = 0;
    let vaultGeneration = 0;
    let vaultIdleTimer = null;
    let vaultActivityHandler = null;

    document.addEventListener('DOMContentLoaded', initializeStorageFeature);

    function initializeStorageFeature() {
        document.getElementById('storage-upload-button')?.addEventListener('click', () => {
            document.getElementById('storage-file-input')?.click();
        });
        document.getElementById('storage-file-input')?.addEventListener('change', uploadSelectedFiles);
        document.getElementById('storage-file-search')?.addEventListener('input', () => renderStorageFiles());
        document.getElementById('credential-vault-setup-form')?.addEventListener('submit', createVault);
        document.getElementById('credential-vault-unlock-form')?.addEventListener('submit', unlockVault);
        document.getElementById('credential-vault-lock-button')?.addEventListener('click', () => lockStorageVault());
        document.getElementById('credential-new-button')?.addEventListener('click', () => openCredentialEditor());
        document.getElementById('credential-cancel-button')?.addEventListener('click', closeCredentialEditor);
        document.getElementById('credential-form')?.addEventListener('submit', saveCredential);
    }

    async function loadStoragePage() {
        if (!window.supabase?.auth) return;
        setStorageMessage('Loading your private storage…');

        try {
            const { data, error } = await window.supabase.auth.getUser();
            if (error || !data.user) throw error || new Error('Sign in to open Storage.');

            if (currentUserId && currentUserId !== data.user.id) {
                lockStorageVault();
            }
            currentUserId = data.user.id;
            const [filesLoaded] = await Promise.all([loadStorageFiles(), loadVaultConfiguration()]);
            if (filesLoaded) setStorageMessage('');
        } catch (error) {
            setStorageMessage('Could not load Storage. Sign in again and retry.', true);
            setVaultPanel('setup');
        }
    }

    async function loadStorageFiles() {
        const requestedUserId = currentUserId;
        const { data, error } = await window.supabase
            .from('storage_files')
            .select('id, object_path, original_name, content_type, size_bytes, category, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            storageFiles = [];
            renderStorageFiles();
            setStorageMessage('Storage setup is incomplete. Run supabase-auth-security.sql in your Supabase project.', true);
            return false;
        }

        if (requestedUserId !== currentUserId) return false;
        storageFiles = data || [];
        await renderStorageFiles();
        return true;
    }

    async function renderStorageFiles() {
        const container = document.getElementById('storage-files-list');
        if (!container) return;
        const renderVersion = ++storageRenderVersion;
        const query = (document.getElementById('storage-file-search')?.value || '').trim().toLowerCase();
        const visibleFiles = storageFiles.filter(file =>
            `${file.original_name} ${file.category}`.toLowerCase().includes(query)
        );

        if (visibleFiles.length === 0) {
            container.replaceChildren();
            const empty = document.createElement('p');
            empty.className = 'storage-empty-state';
            empty.textContent = query ? 'No files match that search.' : 'No files yet. Upload your first document or photo.';
            container.append(empty);
            return;
        }

        const cards = await Promise.all(visibleFiles.map(createStorageFileCard));
        if (renderVersion !== storageRenderVersion) return;
        container.replaceChildren(...cards);
    }

    async function createStorageFileCard(file) {
        const card = document.createElement('article');
        card.className = 'storage-file-card';

        const preview = document.createElement('div');
        preview.className = 'storage-file-preview';
        if (file.content_type?.startsWith('image/')) {
            const { data } = await window.supabase.storage.from(BUCKET).createSignedUrl(file.object_path, 5 * 60);
            if (data?.signedUrl) {
                const image = document.createElement('img');
                image.src = data.signedUrl;
                image.alt = `Preview of ${file.original_name}`;
                image.loading = 'lazy';
                preview.append(image);
            } else {
                preview.append(createFileGlyph(file));
            }
        } else {
            preview.append(createFileGlyph(file));
        }

        const info = document.createElement('div');
        info.className = 'storage-file-info';
        const name = document.createElement('h3');
        name.textContent = file.original_name;
        name.title = file.original_name;
        const metadata = document.createElement('p');
        metadata.textContent = `${file.category} · ${formatFileSize(file.size_bytes)} · ${new Date(file.created_at).toLocaleDateString()}`;
        info.append(name, metadata);

        const actions = document.createElement('div');
        actions.className = 'storage-file-actions';
        const download = document.createElement('button');
        download.type = 'button';
        download.className = 'btn btn-secondary btn-sm';
        download.textContent = 'Download';
        download.addEventListener('click', () => downloadStorageFile(file));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-danger btn-sm';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => deleteStorageFile(file));
        actions.append(download, remove);

        card.append(preview, info, actions);
        return card;
    }

    function createFileGlyph(file) {
        const glyph = document.createElement('div');
        glyph.className = 'storage-file-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        const extension = file.original_name.includes('.') ? file.original_name.split('.').pop() : 'FILE';
        glyph.textContent = extension.slice(0, 6).toUpperCase();
        return glyph;
    }

    async function uploadSelectedFiles(event) {
        const input = event.currentTarget;
        const files = Array.from(input.files || []);
        input.value = '';
        if (files.length === 0) return;

        const button = document.getElementById('storage-upload-button');
        const category = document.getElementById('storage-file-category').value;
        button.disabled = true;
        let uploaded = 0;
        try {
            const { data, error: userError } = await window.supabase.auth.getUser();
            if (userError || !data.user) throw userError || new Error('Your session has expired. Sign in again.');
            currentUserId = data.user.id;

            for (const file of files) {
                setStorageMessage(`Uploading ${uploaded + 1} of ${files.length}: ${file.name}`);
                const objectPath = `${currentUserId}/${window.crypto.randomUUID()}`;
                const { error: uploadError } = await window.supabase.storage.from(BUCKET).upload(objectPath, file, {
                    contentType: file.type || 'application/octet-stream',
                    cacheControl: '3600',
                    upsert: false
                });
                if (uploadError) throw uploadError;

                const { error: insertError } = await window.supabase.from('storage_files').insert({
                    object_path: objectPath,
                    original_name: file.name,
                    content_type: file.type || 'application/octet-stream',
                    size_bytes: file.size,
                    category
                });
                if (insertError) {
                    await window.supabase.storage.from(BUCKET).remove([objectPath]);
                    throw insertError;
                }
                uploaded++;
            }

            await loadStorageFiles();
            setStorageMessage(`${uploaded} file${uploaded === 1 ? '' : 's'} uploaded privately.`);
        } catch (error) {
            setStorageMessage(uploaded ? `${uploaded} file${uploaded === 1 ? '' : 's'} uploaded. The next upload failed: ${error.message}` : `Upload failed: ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    }

    async function downloadStorageFile(file) {
        try {
            const { data, error } = await window.supabase.storage.from(BUCKET).createSignedUrl(file.object_path, 5 * 60, {
                download: file.original_name
            });
            if (error) throw error;
            const link = document.createElement('a');
            link.href = data.signedUrl;
            link.rel = 'noopener noreferrer';
            link.download = file.original_name;
            document.body.append(link);
            link.click();
            link.remove();
        } catch (error) {
            setStorageMessage(`Could not download that file: ${error.message}`, true);
        }
    }

    async function deleteStorageFile(file) {
        if (!window.confirm(`Delete "${file.original_name}" permanently?`)) return;
        try {
            const { error: objectError } = await window.supabase.storage.from(BUCKET).remove([file.object_path]);
            if (objectError) throw objectError;
            const { error: rowError } = await window.supabase.from('storage_files').delete().eq('id', file.id);
            if (rowError) throw rowError;
            storageFiles = storageFiles.filter(item => item.id !== file.id);
            await renderStorageFiles();
            setStorageMessage('File deleted.');
        } catch (error) {
            setStorageMessage(`Could not delete that file: ${error.message}`, true);
        }
    }

    async function loadVaultConfiguration() {
        const { data, error } = await window.supabase
            .from('storage_vaults')
            .select('salt, check_iv, check_ciphertext')
            .maybeSingle();

        if (error) {
            vaultConfiguration = null;
            lockStorageVault();
            setVaultPanel('setup');
            setVaultMessage('vault-setup-message', 'Run supabase-auth-security.sql before creating the credential vault.', true);
            return;
        }

        vaultConfiguration = data || null;
        if (!vaultConfiguration) {
            setVaultPanel('setup');
            return;
        }
        if (vaultKey && vaultKeyUserId === currentUserId) {
            setVaultPanel('open');
            await loadCredentials();
        } else {
            setVaultPanel('locked');
        }
    }

    async function createVault(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const requestGeneration = vaultGeneration;
        const ownerUserId = currentUserId;
        const passphrase = document.getElementById('vault-setup-passphrase').value;
        const confirmation = document.getElementById('vault-setup-confirm').value;
        if (passphrase.length < 12) {
            setVaultMessage('vault-setup-message', 'Use at least 12 characters for your vault passphrase.', true);
            return;
        }
        if (passphrase !== confirmation) {
            setVaultMessage('vault-setup-message', 'The passphrases do not match.', true);
            document.getElementById('vault-setup-confirm').focus();
            return;
        }

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const key = await deriveVaultKey(passphrase, salt);
            const check = await encryptText(VAULT_CHECK_TEXT, key);
            if (requestGeneration !== vaultGeneration || ownerUserId !== currentUserId) return;
            const config = {
                salt: bytesToBase64(salt),
                check_iv: check.iv,
                check_ciphertext: check.ciphertext
            };
            const { data, error } = await window.supabase.from('storage_vaults').insert(config).select('salt, check_iv, check_ciphertext').single();
            if (error) throw error;

            if (requestGeneration !== vaultGeneration || ownerUserId !== currentUserId) return;
            vaultConfiguration = data;
            unlockWithKey(key);
            form.reset();
            setVaultMessage('vault-setup-message', '', false);
            await loadCredentials();
        } catch (error) {
            setVaultMessage('vault-setup-message', `Could not create the vault: ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    }

    async function unlockVault(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const requestGeneration = vaultGeneration;
        const ownerUserId = currentUserId;
        const passphrase = document.getElementById('vault-unlock-passphrase').value;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        setVaultMessage('vault-unlock-message', '', false);
        try {
            const salt = base64ToBytes(vaultConfiguration.salt);
            const candidateKey = await deriveVaultKey(passphrase, salt);
            const check = await decryptText(vaultConfiguration.check_ciphertext, vaultConfiguration.check_iv, candidateKey);
            if (check !== VAULT_CHECK_TEXT) throw new Error('Incorrect passphrase.');
            if (requestGeneration !== vaultGeneration || ownerUserId !== currentUserId) return;

            unlockWithKey(candidateKey);
            form.reset();
            await loadCredentials();
        } catch (error) {
            setVaultMessage('vault-unlock-message', error.message === 'Incorrect passphrase.' ? error.message : 'Could not unlock the vault. Check the passphrase and try again.', true);
        } finally {
            button.disabled = false;
        }
    }

    function unlockWithKey(key) {
        vaultGeneration++;
        vaultKey = key;
        vaultKeyUserId = currentUserId;
        credentialEntries = [];
        setVaultPanel('open');
        startVaultIdleLock();
    }

    async function loadCredentials() {
        if (!vaultKey || vaultKeyUserId !== currentUserId) return;
        const requestKey = vaultKey;
        const requestUserId = currentUserId;
        const requestGeneration = vaultGeneration;
        const list = document.getElementById('credential-list');
        list.replaceChildren();
        setVaultMessage('credential-list-message', 'Decrypting credentials…', false);
        const { data, error } = await window.supabase
            .from('storage_credentials')
            .select('id, ciphertext, iv, encryption_version, created_at, updated_at')
            .order('updated_at', { ascending: false });
        if (error) {
            setVaultMessage('credential-list-message', `Could not load credentials: ${error.message}`, true);
            return;
        }

        try {
            credentialEntries = await Promise.all((data || []).map(async record => ({
                id: record.id,
                created_at: record.created_at,
                updated_at: record.updated_at,
                value: JSON.parse(await decryptText(record.ciphertext, record.iv, requestKey))
            })));
            if (requestGeneration !== vaultGeneration || requestKey !== vaultKey || requestUserId !== currentUserId) return;
            renderCredentials();
            setVaultMessage('credential-list-message', credentialEntries.length ? '' : 'Your vault is empty. Add your first credential.', false);
        } catch (error) {
            lockStorageVault();
            setVaultPanel('locked');
            setVaultMessage('vault-unlock-message', 'The vault could not decrypt its saved entries. Check your passphrase or contact your administrator.', true);
        }
    }

    function renderCredentials() {
        const list = document.getElementById('credential-list');
        list.replaceChildren();
        if (credentialEntries.length === 0) {
            setVaultMessage('credential-list-message', 'Your vault is empty. Add your first credential.', false);
            return;
        }

        for (const entry of credentialEntries) {
            const item = document.createElement('article');
            item.className = 'credential-card';
            const title = document.createElement('h3');
            title.textContent = entry.value.service || 'Untitled account';
            item.append(title);

            if (entry.value.url) {
                const safeUrl = safeWebUrl(entry.value.url);
                if (safeUrl) {
                    const link = document.createElement('a');
                    link.href = safeUrl;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = safeUrl;
                    item.append(link);
                }
            }

            if (entry.value.username) {
                const username = document.createElement('p');
                username.className = 'credential-username';
                username.textContent = entry.value.username;
                item.append(username);
            }

            const secretRow = document.createElement('div');
            secretRow.className = 'credential-secret-row';
            const secret = document.createElement('input');
            secret.type = 'password';
            secret.readOnly = true;
            secret.autocomplete = 'off';
            secret.value = entry.value.password || '';
            secret.setAttribute('aria-label', `Secret for ${entry.value.service || 'saved account'}`);
            const reveal = document.createElement('button');
            reveal.type = 'button';
            reveal.className = 'btn btn-secondary btn-sm';
            reveal.textContent = 'Show';
            reveal.addEventListener('click', () => {
                const showing = secret.type === 'password';
                secret.type = showing ? 'text' : 'password';
                reveal.textContent = showing ? 'Hide' : 'Show';
            });
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'btn btn-secondary btn-sm';
            copy.textContent = 'Copy';
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(entry.value.password || '');
                    copy.textContent = 'Copied';
                    window.setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
                } catch (error) {
                    setVaultMessage('credential-list-message', 'Clipboard access is unavailable in this browser.', true);
                }
            });
            secretRow.append(secret, reveal, copy);
            item.append(secretRow);

            if (entry.value.notes) {
                const notes = document.createElement('p');
                notes.className = 'credential-notes';
                notes.textContent = entry.value.notes;
                item.append(notes);
            }

            const actions = document.createElement('div');
            actions.className = 'credential-actions';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'btn btn-secondary btn-sm';
            edit.textContent = 'Edit';
            edit.addEventListener('click', () => openCredentialEditor(entry));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-danger btn-sm';
            remove.textContent = 'Delete';
            remove.addEventListener('click', () => deleteCredential(entry));
            actions.append(edit, remove);
            item.append(actions);
            list.append(item);
        }
    }

    function openCredentialEditor(entry = null) {
        const form = document.getElementById('credential-form');
        form.reset();
        document.getElementById('credential-id').value = entry?.id || '';
        document.getElementById('credential-service').value = entry?.value.service || '';
        document.getElementById('credential-username').value = entry?.value.username || '';
        document.getElementById('credential-password').value = entry?.value.password || '';
        document.getElementById('credential-url').value = entry?.value.url || '';
        document.getElementById('credential-notes').value = entry?.value.notes || '';
        document.getElementById('credential-save-button').textContent = entry ? 'Update encrypted credential' : 'Save encrypted credential';
        form.hidden = false;
        document.getElementById('credential-service').focus();
    }

    function closeCredentialEditor() {
        const form = document.getElementById('credential-form');
        form.reset();
        form.hidden = true;
        document.getElementById('credential-id').value = '';
        document.getElementById('credential-save-button').textContent = 'Save encrypted credential';
    }

    async function saveCredential(event) {
        event.preventDefault();
        if (!vaultKey || vaultKeyUserId !== currentUserId) {
            setVaultMessage('credential-list-message', 'Unlock your vault before saving credentials.', true);
            return;
        }

        const requestKey = vaultKey;
        const ownerUserId = currentUserId;
        const requestGeneration = vaultGeneration;
        const id = document.getElementById('credential-id').value;
        const urlText = document.getElementById('credential-url').value.trim();
        const safeUrl = urlText ? safeWebUrl(urlText) : '';
        if (urlText && !safeUrl) {
            setVaultMessage('credential-list-message', 'Enter a valid http or https URL.', true);
            return;
        }

        const value = {
            service: document.getElementById('credential-service').value.trim(),
            username: document.getElementById('credential-username').value.trim(),
            password: document.getElementById('credential-password').value,
            url: safeUrl,
            notes: document.getElementById('credential-notes').value.trim()
        };
        const button = document.getElementById('credential-save-button');
        button.disabled = true;
        try {
            const encrypted = await encryptText(JSON.stringify(value), requestKey);
            if (requestGeneration !== vaultGeneration || requestKey !== vaultKey || ownerUserId !== currentUserId) {
                throw new Error('The vault locked before this credential could be saved. Unlock it and try again.');
            }
            const payload = {
                user_id: ownerUserId,
                ciphertext: encrypted.ciphertext,
                iv: encrypted.iv,
                encryption_version: 1,
                updated_at: new Date().toISOString()
            };
            let error;
            if (id) {
                ({ error } = await window.supabase.from('storage_credentials').update(payload).eq('id', id).eq('user_id', ownerUserId));
            } else {
                ({ error } = await window.supabase.from('storage_credentials').insert(payload));
            }
            if (error) throw error;
            if (requestGeneration !== vaultGeneration || requestKey !== vaultKey || ownerUserId !== currentUserId) return;
            closeCredentialEditor();
            await loadCredentials();
        } catch (error) {
            setVaultMessage('credential-list-message', `Could not save the encrypted credential: ${error.message}`, true);
        } finally {
            button.disabled = false;
        }
    }

    async function deleteCredential(entry) {
        if (!window.confirm(`Delete the saved credential for "${entry.value.service}"?`)) return;
        const { error } = await window.supabase.from('storage_credentials').delete().eq('id', entry.id);
        if (error) {
            setVaultMessage('credential-list-message', `Could not delete that credential: ${error.message}`, true);
            return;
        }
        credentialEntries = credentialEntries.filter(item => item.id !== entry.id);
        renderCredentials();
    }

    async function deriveVaultKey(passphrase, salt) {
        if (!window.crypto?.subtle) throw new Error('Secure browser encryption requires HTTPS and Web Crypto support.');
        const material = await window.crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        return window.crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: VAULT_ITERATIONS, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptText(text, key) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
        return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
    }

    async function decryptText(ciphertext, iv, key) {
        const plaintext = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64ToBytes(iv) },
            key,
            base64ToBytes(ciphertext)
        );
        return decoder.decode(plaintext);
    }

    function bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return btoa(binary);
    }

    function base64ToBytes(value) {
        const binary = atob(value);
        return Uint8Array.from(binary, character => character.charCodeAt(0));
    }

    function lockStorageVault() {
        vaultGeneration++;
        clearTimeout(vaultIdleTimer);
        vaultIdleTimer = null;
        if (vaultActivityHandler) {
            ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
                document.removeEventListener(eventName, vaultActivityHandler);
            });
            vaultActivityHandler = null;
        }
        vaultKey = null;
        vaultKeyUserId = null;
        credentialEntries = [];
        const form = document.getElementById('credential-form');
        if (form) {
            form.reset();
            form.hidden = true;
        }
        document.getElementById('credential-vault-setup-form')?.reset();
        document.getElementById('credential-vault-unlock-form')?.reset();
        document.getElementById('credential-list')?.replaceChildren();
        if (vaultConfiguration) setVaultPanel('locked');
        else setVaultPanel('setup');
        setVaultMessage('credential-list-message', '', false);
    }

    function startVaultIdleLock() {
        clearTimeout(vaultIdleTimer);
        if (!vaultActivityHandler) {
            vaultActivityHandler = () => {
                clearTimeout(vaultIdleTimer);
                vaultIdleTimer = window.setTimeout(() => {
                    lockStorageVault();
                    setVaultMessage('vault-unlock-message', 'Vault locked after 15 minutes of inactivity.', false);
                }, VAULT_IDLE_MS);
            };
            ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
                document.addEventListener(eventName, vaultActivityHandler, { passive: true });
            });
        }
        vaultActivityHandler();
    }

    function setVaultPanel(panel) {
        document.getElementById('credential-vault-setup').hidden = panel !== 'setup';
        document.getElementById('credential-vault-locked').hidden = panel !== 'locked';
        document.getElementById('credential-vault-open').hidden = panel !== 'open';
    }

    function setStorageMessage(message, isError = false) {
        const element = document.getElementById('storage-file-message');
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', Boolean(isError && message));
        element.classList.toggle('is-visible', Boolean(message));
    }

    function setVaultMessage(id, message, isError) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', Boolean(isError && message));
        element.classList.toggle('is-visible', Boolean(message));
    }

    function safeWebUrl(value) {
        try {
            const url = new URL(value);
            return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function formatFileSize(size) {
        if (!Number.isFinite(size) || size <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
        return `${(size / (1024 ** unit)).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
    }

    window.loadStoragePage = loadStoragePage;
    window.lockStorageVault = lockStorageVault;
})();

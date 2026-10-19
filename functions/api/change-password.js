// Cloudflare Pages Function: POST /api/change-password
import { getSession, getUsers, saveUsers, hashPassword, jsonResponse } from './_db.js';

export async function onRequestPost({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const currentPassword = (body.currentPassword || '').trim();
    const newPassword = (body.newPassword || '').trim();

    if (!currentPassword || !newPassword) {
        return jsonResponse({ error: 'Missing current or new password' }, 400);
    }

    if (newPassword.length < 4) {
        return jsonResponse({ error: 'Password must be at least 4 characters.' }, 400);
    }

    const users = await getUsers(env);
    const currentHash = await hashPassword(currentPassword);

    const userRecord = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
    if (!userRecord) {
        return jsonResponse({ error: 'User record not found.' }, 404);
    }

    if (userRecord.passwordHash !== currentHash) {
        return jsonResponse({ error: 'Incorrect current password.' }, 400);
    }

    userRecord.passwordHash = await hashPassword(newPassword);
    await saveUsers(env, users);

    return jsonResponse({ status: 'success', message: 'Password changed successfully.' }, 200);
}

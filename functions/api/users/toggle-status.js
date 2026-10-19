// Cloudflare Pages Function: POST /api/users/toggle-status (Admin Only)
import { getSession, getUsers, saveUsers, jsonResponse } from '../_db.js';

export async function onRequestPost({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (session.role !== 'admin') {
        return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const targetUsername = (body.username || '').trim();

    if (!targetUsername) {
        return jsonResponse({ error: 'Missing username.' }, 400);
    }

    if (targetUsername.toLowerCase() === 'ceo' || targetUsername.toLowerCase() === session.username.toLowerCase()) {
        return jsonResponse({ error: 'Cannot inactivate default admin account or your active account.' }, 400);
    }

    const users = await getUsers(env);
    const targetUser = users.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());

    if (!targetUser) {
        return jsonResponse({ error: 'User not found.' }, 404);
    }

    const currentStatus = targetUser.status || 'active';
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    targetUser.status = newStatus;

    await saveUsers(env, users);

    return jsonResponse({ status: 'success', username: targetUsername, newStatus }, 200);
}

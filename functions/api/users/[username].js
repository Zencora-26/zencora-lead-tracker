// Cloudflare Pages Function: DELETE /api/users/:username (Admin Only)
import { getSession, getUsers, saveUsers, jsonResponse } from '../_db.js';

export async function onRequestDelete({ request, params, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (session.role !== 'admin') {
        return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
    }

    const username = (params.username || '').trim();
    if (!username) {
        return jsonResponse({ error: 'Missing username parameter' }, 400);
    }

    if (username.toLowerCase() === 'ceo' || username.toLowerCase() === session.username.toLowerCase()) {
        return jsonResponse({ error: 'Cannot delete default admin or current user account' }, 400);
    }

    const users = await getUsers(env);
    const filteredUsers = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());

    if (filteredUsers.length === users.length) {
        return jsonResponse({ error: 'User not found.' }, 404);
    }

    await saveUsers(env, filteredUsers);
    return jsonResponse({ status: 'success', deleted: username }, 200);
}

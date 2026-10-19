// Cloudflare Pages Function: GET & POST /api/users (Admin Only)
import { getSession, getUsers, saveUsers, hashPassword, jsonResponse } from '../_db.js';

export async function onRequestGet({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (session.role !== 'admin') {
        return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
    }

    const users = await getUsers(env);
    const cleanUsers = users.map(u => ({
        username: u.username,
        role: u.role,
        displayName: u.displayName,
        status: u.status || 'active'
    }));

    return jsonResponse(cleanUsers, 200);
}

export async function onRequestPost({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (session.role !== 'admin') {
        return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();
    const displayName = (body.displayName || '').trim();

    if (!username || !password || !displayName) {
        return jsonResponse({ error: 'Missing username, password, or display name' }, 400);
    }

    const users = await getUsers(env);

    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return jsonResponse({ error: 'Username already exists.' }, 400);
    }

    const newUser = {
        username,
        passwordHash: await hashPassword(password),
        role: 'bde',
        displayName,
        status: 'active'
    };

    users.push(newUser);
    await saveUsers(env, users);

    return jsonResponse({ status: 'success', username }, 200);
}

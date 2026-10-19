// Cloudflare Pages Function: POST /api/login
import { getUsers, hashPassword, createSession, jsonResponse } from './_db.js';

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json().catch(() => ({}));
        const username = (body.username || '').trim();
        const password = (body.password || '').trim();

        if (!username || !password) {
            return jsonResponse({ error: 'Missing username or password' }, 400);
        }

        const users = await getUsers(env);
        const targetHash = await hashPassword(password);

        const matchedUser = users.find(u => 
            u.username.toLowerCase() === username.toLowerCase() && 
            u.passwordHash === targetHash
        );

        if (!matchedUser) {
            return jsonResponse({ error: 'Invalid username or password' }, 401);
        }

        if (matchedUser.status === 'inactive') {
            return jsonResponse({ error: 'Account is inactive. Please contact system administrator.' }, 403);
        }

        const token = await createSession(env, matchedUser);

        return jsonResponse({
            token,
            username: matchedUser.username,
            role: matchedUser.role,
            displayName: matchedUser.displayName
        }, 200);

    } catch (err) {
        return jsonResponse({ error: err.message || 'Internal server error' }, 500);
    }
}

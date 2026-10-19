// Cloudflare Pages Function: POST /api/logout
import { deleteSession, jsonResponse } from './_db.js';

export async function onRequestPost({ request, env }) {
    try {
        await deleteSession(env, request);
        return jsonResponse({ status: 'logged_out' }, 200);
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

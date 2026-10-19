// Cloudflare Pages Function: GET & POST /api/leads
import { getSession, getLeads, saveLeads, jsonResponse } from './_db.js';

export async function onRequestGet({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized. Missing or invalid session token.' }, 401);
    }

    const allLeads = await getLeads(env);

    // Admin sees all leads, BDE sees only leads assigned to them
    if (session.role === 'admin') {
        return jsonResponse(allLeads, 200);
    }

    const filtered = allLeads.filter(l => 
        (l.assignedBde || '').trim().toLowerCase() === session.displayName.trim().toLowerCase()
    );

    return jsonResponse(filtered, 200);
}

export async function onRequestPost({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const payload = await request.json().catch(() => null);
    if (!Array.isArray(payload)) {
        return jsonResponse({ error: 'Invalid format. Expected list of leads.' }, 400);
    }

    let allLeads = await getLeads(env);

    if (session.role === 'admin') {
        // Admin can overwrite entire database
        allLeads = payload;
    } else {
        // BDE:
        // 1. Remove previous leads belonging to this BDE
        allLeads = allLeads.filter(l => 
            (l.assignedBde || '').trim().toLowerCase() !== session.displayName.trim().toLowerCase()
        );

        // 2. Sanitize and append incoming BDE leads (forcing assignedBde to their display name)
        for (const lead of payload) {
            lead.assignedBde = session.displayName;
            allLeads.push(lead);
        }
    }

    await saveLeads(env, allLeads);
    return jsonResponse({ status: 'success', count: allLeads.length }, 200);
}

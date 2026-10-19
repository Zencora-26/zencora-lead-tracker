// Unified Cloudflare Full-Stack Worker (_worker.js)
// Handles all API endpoints & serves static assets seamlessly

const DEFAULT_USERS = [
    {
        "username": "ceo",
        "passwordHash": "4445d328252601d795228de88d097ffd6688f7b8de88de62c698317d9a7e2abe",
        "role": "admin",
        "displayName": "Mujibu Rahuman P M",
        "status": "active"
    },
    {
        "username": "Prakash_Zencora",
        "passwordHash": "71277a7f6e704b17c2e02cf25af55f6d64406b42bc1ec8e330244d8687969318",
        "role": "bde",
        "displayName": "Prakash Sah",
        "status": "inactive"
    },
    {
        "username": "Christina_Zencora",
        "passwordHash": "71277a7f6e704b17c2e02cf25af55f6d64406b42bc1ec8e330244d8687969318",
        "role": "bde",
        "displayName": "Christina Marie Short",
        "status": "active"
    },
    {
        "username": "md_rifa",
        "passwordHash": "522d567ed9b8df2d4ebdbe16c5acaf79fb1654ac53dc3d57357713d5d61684a4",
        "role": "bde",
        "displayName": "Mohamed Rifahath",
        "status": "active"
    }
];

const DEFAULT_LEADS = [
    {
        "id": "ZHS-LD-001",
        "dateAdded": "2026-07-22",
        "name": "AM Billers",
        "specialty": "Home Health",
        "contactName": "Derick Jennings",
        "contactTitle": "Director of Operations",
        "contactEmail": "derick@amb5280.com",
        "contactPhone": "+1 303 968 9512",
        "ehrSystem": "Medisoft",
        "outreachChannel": "Email",
        "leadStage": "Closed-Lost",
        "dateLastTouch": "2026-07-22",
        "followUpStatus": "No Response",
        "nextActionDate": "2026-07-27",
        "estValue": 750,
        "assignedBde": "Prakash Sah",
        "notes": "Should Start Training"
    },
    {
        "id": "ZHS-LD-003",
        "dateAdded": "2026-08-10",
        "name": "Venkateswara Hospitals",
        "specialty": "Multiple",
        "contactName": "Rajesh Kumar",
        "contactTitle": "COO",
        "contactEmail": "",
        "contactPhone": "",
        "ehrSystem": "Unknown",
        "outreachChannel": "LinkedIn",
        "leadStage": "Contacted",
        "dateLastTouch": "2026-08-10",
        "followUpStatus": "Day 1 - Sent",
        "nextActionDate": "2026-08-12",
        "estValue": 1000,
        "assignedBde": "Admin",
        "notes": "Ensure Pitching about zencora"
    }
];

// In-memory fallback if KV binding is not yet attached
let MEMORY_STORE = {
    users: null,
    leads: null,
    sessions: {}
};

// SHA-256 password hashing matching Python hashlib.sha256
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// JSON Response Helper
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
    });
}

// Database Helpers
async function getUsers(env) {
    if (env && env.DB) {
        const data = await env.DB.get('users', 'json');
        if (data && Array.isArray(data)) return data;
        await env.DB.put('users', JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
    if (!MEMORY_STORE.users) {
        MEMORY_STORE.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
    return MEMORY_STORE.users;
}

async function saveUsers(env, users) {
    if (env && env.DB) {
        await env.DB.put('users', JSON.stringify(users));
        return;
    }
    MEMORY_STORE.users = users;
}

async function getLeads(env) {
    if (env && env.DB) {
        const data = await env.DB.get('leads', 'json');
        if (data && Array.isArray(data)) return data;
        await env.DB.put('leads', JSON.stringify(DEFAULT_LEADS));
        return DEFAULT_LEADS;
    }
    if (!MEMORY_STORE.leads) {
        MEMORY_STORE.leads = JSON.parse(JSON.stringify(DEFAULT_LEADS));
    }
    return MEMORY_STORE.leads;
}

async function saveLeads(env, leads) {
    if (env && env.DB) {
        await env.DB.put('leads', JSON.stringify(leads));
        return;
    }
    MEMORY_STORE.leads = leads;
}

async function createSession(env, user) {
    const token = crypto.randomUUID();
    const sessionData = {
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        createdAt: Date.now()
    };
    if (env && env.DB) {
        await env.DB.put(`session:${token}`, JSON.stringify(sessionData), { expirationTtl: 604800 });
    } else {
        MEMORY_STORE.sessions[token] = sessionData;
    }
    return token;
}

async function getSession(env, request) {
    let token = null;
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1].trim();
    } else {
        const url = new URL(request.url);
        token = url.searchParams.get('token');
    }
    if (!token) return null;
    if (env && env.DB) {
        return await env.DB.get(`session:${token}`, 'json');
    }
    return MEMORY_STORE.sessions[token] || null;
}

async function deleteSession(env, request) {
    let token = null;
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1].trim();
    }
    if (!token) return;
    if (env && env.DB) {
        await env.DB.delete(`session:${token}`);
    } else {
        delete MEMORY_STORE.sessions[token];
    }
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // If not an API route, serve static assets (index.html, etc.)
        if (!path.startsWith('/api/')) {
            if (env.ASSETS) {
                return env.ASSETS.fetch(request);
            }
            return new Response('Asset fetcher not initialized', { status: 404 });
        }

        try {
            // 1. POST /api/login
            if (path === '/api/login' && method === 'POST') {
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
            }

            // 2. POST /api/logout
            if (path === '/api/logout' && method === 'POST') {
                await deleteSession(env, request);
                return jsonResponse({ status: 'logged_out' }, 200);
            }

            // 3. Authenticated routes check
            const session = await getSession(env, request);
            if (!session) {
                return jsonResponse({ error: 'Unauthorized. Missing or invalid session token.' }, 401);
            }

            // 4. GET & POST /api/leads
            if (path === '/api/leads') {
                if (method === 'GET') {
                    const allLeads = await getLeads(env);
                    if (session.role === 'admin') {
                        return jsonResponse(allLeads, 200);
                    }
                    const filtered = allLeads.filter(l => 
                        (l.assignedBde || '').trim().toLowerCase() === session.displayName.trim().toLowerCase()
                    );
                    return jsonResponse(filtered, 200);
                }

                if (method === 'POST') {
                    const payload = await request.json().catch(() => null);
                    if (!Array.isArray(payload)) {
                        return jsonResponse({ error: 'Invalid format. Expected list of leads.' }, 400);
                    }

                    let allLeads = await getLeads(env);
                    if (session.role === 'admin') {
                        allLeads = payload;
                    } else {
                        allLeads = allLeads.filter(l => 
                            (l.assignedBde || '').trim().toLowerCase() !== session.displayName.trim().toLowerCase()
                        );
                        for (const lead of payload) {
                            lead.assignedBde = session.displayName;
                            allLeads.push(lead);
                        }
                    }
                    await saveLeads(env, allLeads);
                    return jsonResponse({ status: 'success', count: allLeads.length }, 200);
                }
            }

            // 5. GET /api/download (CSV Export)
            if (path === '/api/download' && method === 'GET') {
                const allLeads = await getLeads(env);
                const filteredLeads = session.role === 'admin'
                    ? allLeads
                    : allLeads.filter(l => (l.assignedBde || '').trim().toLowerCase() === session.displayName.trim().toLowerCase());

                const headers = [
                    "Lead ID", "Date Added", "Practice / Clinic Name", "Specialty", "EHR System",
                    "Contact Person", "Contact Title", "Contact Email", "Contact Phone", "Outreach Channel",
                    "Assigned BDE", "Lead Stage", "Est. Monthly Value ($)", "Follow-up Cadence",
                    "Date Last Touch", "Next Action Date", "Notes"
                ];

                const escapeCsv = (val) => {
                    if (val === null || val === undefined) return '""';
                    return `"${String(val).replace(/"/g, '""')}"`;
                };

                const rows = [headers.map(escapeCsv).join(',')];
                for (const l of filteredLeads) {
                    rows.push([
                        l.id || '', l.dateAdded || '', l.name || '', l.specialty || '', l.ehrSystem || '',
                        l.contactName || '', l.contactTitle || '', l.contactEmail || '', l.contactPhone || '',
                        l.outreachChannel || '', l.assignedBde || '', l.leadStage || '', l.estValue || 0,
                        l.followUpStatus || '', l.dateLastTouch || '', l.nextActionDate || '', l.notes || ''
                    ].map(escapeCsv).join(','));
                }

                const csv = '\uFEFF' + rows.join('\r\n');
                return new Response(csv, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': 'attachment; filename="zencora_lead_tracker.csv"',
                        'Cache-Control': 'no-cache, no-store, must-revalidate'
                    }
                });
            }

            // 6. POST /api/change-password
            if (path === '/api/change-password' && method === 'POST') {
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

                if (!userRecord) return jsonResponse({ error: 'User not found.' }, 404);
                if (userRecord.passwordHash !== currentHash) {
                    return jsonResponse({ error: 'Incorrect current password.' }, 400);
                }

                userRecord.passwordHash = await hashPassword(newPassword);
                await saveUsers(env, users);
                return jsonResponse({ status: 'success', message: 'Password changed successfully.' }, 200);
            }

            // 7. Admin Only Routes: /api/users
            if (path === '/api/users') {
                if (session.role !== 'admin') {
                    return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
                }

                if (method === 'GET') {
                    const users = await getUsers(env);
                    const clean = users.map(u => ({
                        username: u.username,
                        role: u.role,
                        displayName: u.displayName,
                        status: u.status || 'active'
                    }));
                    return jsonResponse(clean, 200);
                }

                if (method === 'POST') {
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

                    users.push({
                        username,
                        passwordHash: await hashPassword(password),
                        role: 'bde',
                        displayName,
                        status: 'active'
                    });
                    await saveUsers(env, users);
                    return jsonResponse({ status: 'success', username }, 200);
                }
            }

            // 8. Admin Only Route: POST /api/users/toggle-status
            if (path === '/api/users/toggle-status' && method === 'POST') {
                if (session.role !== 'admin') {
                    return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
                }

                const body = await request.json().catch(() => ({}));
                const targetUsername = (body.username || '').trim();
                if (!targetUsername) return jsonResponse({ error: 'Missing username.' }, 400);
                if (targetUsername.toLowerCase() === 'ceo' || targetUsername.toLowerCase() === session.username.toLowerCase()) {
                    return jsonResponse({ error: 'Cannot inactivate default admin account or your active account.' }, 400);
                }

                const users = await getUsers(env);
                const targetUser = users.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
                if (!targetUser) return jsonResponse({ error: 'User not found.' }, 404);

                const newStatus = (targetUser.status || 'active') === 'active' ? 'inactive' : 'active';
                targetUser.status = newStatus;
                await saveUsers(env, users);
                return jsonResponse({ status: 'success', username: targetUsername, newStatus }, 200);
            }

            // 9. Admin Only Route: DELETE /api/users/:username
            if (path.startsWith('/api/users/') && method === 'DELETE') {
                if (session.role !== 'admin') {
                    return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
                }

                const username = path.replace('/api/users/', '').trim();
                if (!username || username.toLowerCase() === 'ceo' || username.toLowerCase() === session.username.toLowerCase()) {
                    return jsonResponse({ error: 'Cannot delete default admin or current user account' }, 400);
                }

                const users = await getUsers(env);
                const filtered = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
                if (filtered.length === users.length) return jsonResponse({ error: 'User not found.' }, 404);

                await saveUsers(env, filtered);
                return jsonResponse({ status: 'success', deleted: username }, 200);
            }

            return jsonResponse({ error: 'Endpoint Not Found' }, 404);

        } catch (err) {
            return jsonResponse({ error: err.message || 'Server error' }, 500);
        }
    }
};

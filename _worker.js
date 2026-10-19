// Unified Cloudflare Full-Stack Worker (_worker.js)
// Handles multi-identifier auth (User ID, Email, Phone), OTP Forgot Password, Profile & Avatars, Admin Change Requests, and Leads

const DEFAULT_USERS = [
    {
        "username": "ceo",
        "passwordHash": "4445d328252601d795228de88d097ffd6688f7b8de88de62c698317d9a7e2abe",
        "role": "admin",
        "displayName": "Mujibu Rahuman P M",
        "email": "ceo@zencorahs.com",
        "phone": "+1 555-0100",
        "avatar": "",
        "status": "active"
    },
    {
        "username": "Prakash_Zencora",
        "passwordHash": "71277a7f6e704b17c2e02cf25af55f6d64406b42bc1ec8e330244d8687969318",
        "role": "bde",
        "displayName": "Prakash Sah",
        "email": "prakash@zencorahs.com",
        "phone": "+1 303-968-9512",
        "avatar": "",
        "status": "inactive"
    },
    {
        "username": "Christina_Zencora",
        "passwordHash": "71277a7f6e704b17c2e02cf25af55f6d64406b42bc1ec8e330244d8687969318",
        "role": "bde",
        "displayName": "Christina Marie Short",
        "email": "christina@zencorahs.com",
        "phone": "+1 555-0145",
        "avatar": "",
        "status": "active"
    },
    {
        "username": "md_rifa",
        "passwordHash": "522d567ed9b8df2d4ebdbe16c5acaf79fb1654ac53dc3d57357713d5d61684a4",
        "role": "bde",
        "displayName": "Mohamed Rifahath",
        "email": "rifa@zencorahs.com",
        "phone": "+1 555-0188",
        "avatar": "",
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

// In-memory fallback store
let MEMORY_STORE = {
    users: null,
    leads: null,
    profileRequests: [],
    sessions: {},
    otps: {}
};

// Utilities
function normalizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/[^0-9]/g, '');
}

function maskContact(user) {
    let emailMask = '';
    if (user.email && user.email.includes('@')) {
        const parts = user.email.split('@');
        const namePart = parts[0];
        const masked = namePart.length > 2 ? namePart[0] + '***' + namePart.slice(-1) : namePart[0] + '***';
        emailMask = `${masked}@${parts[1]}`;
    }
    let phoneMask = '';
    if (user.phone) {
        const clean = user.phone.trim();
        phoneMask = clean.length > 4 ? clean.slice(0, 3) + ' **** ' + clean.slice(-4) : clean;
    }
    return { emailMask, phoneMask };
}

function findUserByIdentifier(users, query) {
    if (!query) return null;
    const cleanQ = query.trim().toLowerCase();
    const cleanPhoneQ = normalizePhone(query);

    return users.find(u => {
        if ((u.username || '').toLowerCase() === cleanQ) return true;
        if ((u.email || '').toLowerCase() === cleanQ) return true;
        if (cleanPhoneQ && cleanPhoneQ.length >= 7 && normalizePhone(u.phone) === cleanPhoneQ) return true;
        return false;
    }) || null;
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

async function getProfileRequests(env) {
    if (env && env.DB) {
        const data = await env.DB.get('profile_requests', 'json');
        if (data && Array.isArray(data)) return data;
        await env.DB.put('profile_requests', JSON.stringify([]));
        return [];
    }
    return MEMORY_STORE.profileRequests || [];
}

async function saveProfileRequests(env, requests) {
    if (env && env.DB) {
        await env.DB.put('profile_requests', JSON.stringify(requests));
        return;
    }
    MEMORY_STORE.profileRequests = requests;
}

async function saveOtp(env, identifier, otpData) {
    const key = `otp:${identifier.toLowerCase()}`;
    if (env && env.DB) {
        await env.DB.put(key, JSON.stringify(otpData), { expirationTtl: 600 }); // 10 mins
    } else {
        MEMORY_STORE.otps[key] = { ...otpData, expiresAt: Date.now() + 600000 };
    }
}

async function getOtp(env, identifier) {
    const key = `otp:${identifier.toLowerCase()}`;
    if (env && env.DB) {
        return await env.DB.get(key, 'json');
    }
    const mem = MEMORY_STORE.otps[key];
    if (mem && mem.expiresAt > Date.now()) return mem;
    return null;
}

async function deleteOtp(env, identifier) {
    const key = `otp:${identifier.toLowerCase()}`;
    if (env && env.DB) {
        await env.DB.delete(key);
    } else {
        delete MEMORY_STORE.otps[key];
    }
}

async function createSession(env, user) {
    const token = crypto.randomUUID();
    const sessionData = {
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        email: user.email || '',
        phone: user.phone || '',
        avatar: user.avatar || '',
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

async function updateSessionUser(env, token, updatedFields) {
    if (!token) return;
    if (env && env.DB) {
        const session = await env.DB.get(`session:${token}`, 'json');
        if (session) {
            Object.assign(session, updatedFields);
            await env.DB.put(`session:${token}`, JSON.stringify(session), { expirationTtl: 604800 });
        }
    } else if (MEMORY_STORE.sessions[token]) {
        Object.assign(MEMORY_STORE.sessions[token], updatedFields);
    }
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
            // 1. POST /api/login (Supports User ID, Email, or Mobile Number)
            if (path === '/api/login' && method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const identifier = (body.identifier || body.username || '').trim();
                const password = (body.password || '').trim();

                if (!identifier || !password) {
                    return jsonResponse({ error: 'Please enter your User ID, Email, or Mobile number and password.' }, 400);
                }

                const users = await getUsers(env);
                const targetHash = await hashPassword(password);
                const matchedUser = findUserByIdentifier(users, identifier);

                if (!matchedUser || matchedUser.passwordHash !== targetHash) {
                    return jsonResponse({ error: 'Invalid login credentials. Check your username, email, phone, or password.' }, 401);
                }

                if (matchedUser.status === 'inactive') {
                    return jsonResponse({ error: 'This account has been deactivated. Please contact your system administrator.' }, 403);
                }

                const token = await createSession(env, matchedUser);
                return jsonResponse({
                    token,
                    username: matchedUser.username,
                    role: matchedUser.role,
                    displayName: matchedUser.displayName,
                    email: matchedUser.email || '',
                    phone: matchedUser.phone || '',
                    avatar: matchedUser.avatar || ''
                }, 200);
            }

            // 2. POST /api/forgot-password/request (Generates 6-Digit OTP)
            if (path === '/api/forgot-password/request' && method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const identifier = (body.identifier || '').trim();

                if (!identifier) {
                    return jsonResponse({ error: 'Please enter your registered User ID, Email, or Mobile number.' }, 400);
                }

                const users = await getUsers(env);
                const user = findUserByIdentifier(users, identifier);

                if (!user) {
                    return jsonResponse({ error: 'No active user account found matching this identifier.' }, 404);
                }

                if (user.status === 'inactive') {
                    return jsonResponse({ error: 'Account is deactivated. Contact your administrator.' }, 403);
                }

                // Generate secure 6-digit OTP
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                await saveOtp(env, user.username, {
                    username: user.username,
                    otp,
                    createdAt: Date.now()
                });

                const { emailMask, phoneMask } = maskContact(user);
                let messageDestination = emailMask ? `Email (${emailMask})` : '';
                if (phoneMask) {
                    messageDestination += messageDestination ? ` and Mobile (${phoneMask})` : `Mobile (${phoneMask})`;
                }

                return jsonResponse({
                    status: 'success',
                    username: user.username,
                    message: `Verification code generated for ${messageDestination || user.username}.`,
                    otpDev: otp // Returned so user can test immediately in the UI notification
                }, 200);
            }

            // 3. POST /api/forgot-password/reset (Verifies OTP & Sets New Password)
            if (path === '/api/forgot-password/reset' && method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const identifier = (body.identifier || '').trim();
                const otpInput = (body.otp || '').trim();
                const newPassword = (body.newPassword || '').trim();

                if (!identifier || !otpInput || !newPassword) {
                    return jsonResponse({ error: 'Missing identifier, OTP code, or new password.' }, 400);
                }
                if (newPassword.length < 4) {
                    return jsonResponse({ error: 'Password must be at least 4 characters long.' }, 400);
                }

                const users = await getUsers(env);
                const user = findUserByIdentifier(users, identifier);
                if (!user) {
                    return jsonResponse({ error: 'User account not found.' }, 404);
                }

                const storedOtpData = await getOtp(env, user.username);
                if (!storedOtpData || storedOtpData.otp !== otpInput) {
                    return jsonResponse({ error: 'Invalid or expired OTP code. Please request a new one.' }, 400);
                }

                user.passwordHash = await hashPassword(newPassword);
                await saveUsers(env, users);
                await deleteOtp(env, user.username);

                return jsonResponse({
                    status: 'success',
                    message: 'Password updated successfully! You can now log in.'
                }, 200);
            }

            // 4. POST /api/logout
            if (path === '/api/logout' && method === 'POST') {
                await deleteSession(env, request);
                return jsonResponse({ status: 'logged_out' }, 200);
            }

            // --- Authenticated routes check ---
            const session = await getSession(env, request);
            if (!session) {
                return jsonResponse({ error: 'Unauthorized. Missing or invalid session token.' }, 401);
            }

            // 5. GET /api/profile (Personal information view)
            if (path === '/api/profile' && method === 'GET') {
                const users = await getUsers(env);
                const user = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
                if (!user) return jsonResponse({ error: 'User not found.' }, 404);

                return jsonResponse({
                    username: user.username,
                    displayName: user.displayName,
                    email: user.email || '',
                    phone: user.phone || '',
                    avatar: user.avatar || '',
                    role: user.role,
                    status: user.status || 'active'
                }, 200);
            }

            // 6. POST /api/profile/avatar (Self-service avatar upload)
            if (path === '/api/profile/avatar' && method === 'POST') {
                const body = await request.json().catch(() => ({}));
                const avatar = (body.avatar || '').trim();

                const users = await getUsers(env);
                const user = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
                if (!user) return jsonResponse({ error: 'User not found.' }, 404);

                user.avatar = avatar;
                await saveUsers(env, users);

                // Update live session
                let token = null;
                const authHeader = request.headers.get('Authorization');
                if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.split(' ')[1].trim();
                if (token) await updateSessionUser(env, token, { avatar });

                return jsonResponse({ status: 'success', avatar }, 200);
            }

            // 7. GET & POST /api/profile-requests (User submits change request / Admin views list)
            if (path === '/api/profile-requests') {
                if (method === 'GET') {
                    const requests = await getProfileRequests(env);
                    if (session.role === 'admin') {
                        return jsonResponse(requests, 200);
                    }
                    const userRequests = requests.filter(r => (r.username || '').toLowerCase() === session.username.toLowerCase());
                    return jsonResponse(userRequests, 200);
                }

                if (method === 'POST') {
                    const body = await request.json().catch(() => ({}));
                    const requestedName = (body.displayName || '').trim();
                    const requestedEmail = (body.email || '').trim();
                    const requestedPhone = (body.phone || '').trim();
                    const reason = (body.reason || '').trim();

                    if (!requestedName && !requestedEmail && !requestedPhone) {
                        return jsonResponse({ error: 'Please specify at least one field to change.' }, 400);
                    }

                    const users = await getUsers(env);
                    const user = users.find(u => u.username.toLowerCase() === session.username.toLowerCase());
                    if (!user) return jsonResponse({ error: 'User not found.' }, 404);

                    const requests = await getProfileRequests(env);
                    const newRequest = {
                        id: `REQ-${Date.now().toString().slice(-6)}`,
                        username: user.username,
                        currentName: user.displayName,
                        currentEmail: user.email || '',
                        currentPhone: user.phone || '',
                        requestedName: requestedName || user.displayName,
                        requestedEmail: requestedEmail || user.email || '',
                        requestedPhone: requestedPhone || user.phone || '',
                        reason: reason || 'Personal details update',
                        status: 'pending',
                        createdAt: new Date().toISOString()
                    };

                    requests.unshift(newRequest);
                    await saveProfileRequests(env, requests);

                    return jsonResponse({ status: 'success', request: newRequest }, 201);
                }
            }

            // 8. POST /api/profile-requests/review (Admin approves or rejects change request)
            if (path === '/api/profile-requests/review' && method === 'POST') {
                if (session.role !== 'admin') {
                    return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
                }

                const body = await request.json().catch(() => ({}));
                const requestId = (body.requestId || '').trim();
                const action = (body.action || '').trim().toLowerCase(); // 'approve' or 'reject'
                const comment = (body.comment || '').trim();

                if (!requestId || !['approve', 'reject'].includes(action)) {
                    return jsonResponse({ error: 'Invalid request ID or action.' }, 400);
                }

                const requests = await getProfileRequests(env);
                const reqItem = requests.find(r => r.id === requestId);
                if (!reqItem) return jsonResponse({ error: 'Request not found.' }, 404);

                if (reqItem.status !== 'pending') {
                    return jsonResponse({ error: `This request is already ${reqItem.status}.` }, 400);
                }

                reqItem.status = action === 'approve' ? 'approved' : 'rejected';
                reqItem.reviewedBy = session.username;
                reqItem.reviewedAt = new Date().toISOString();
                reqItem.adminComment = comment;

                // If approved, automatically update the user's master record
                if (action === 'approve') {
                    const users = await getUsers(env);
                    const targetUser = users.find(u => u.username.toLowerCase() === reqItem.username.toLowerCase());
                    if (targetUser) {
                        if (reqItem.requestedName) targetUser.displayName = reqItem.requestedName;
                        if (reqItem.requestedEmail) targetUser.email = reqItem.requestedEmail;
                        if (reqItem.requestedPhone) targetUser.phone = reqItem.requestedPhone;
                        await saveUsers(env, users);
                    }
                }

                await saveProfileRequests(env, requests);
                return jsonResponse({ status: 'success', request: reqItem }, 200);
            }

            // 9. GET & POST /api/leads
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

            // 10. GET /api/download (CSV Export)
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

            // 11. POST /api/change-password (Logged-in user)
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

            // 12. Admin Only Routes: /api/users
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
                        email: u.email || '',
                        phone: u.phone || '',
                        avatar: u.avatar || '',
                        status: u.status || 'active'
                    }));
                    return jsonResponse(clean, 200);
                }

                if (method === 'POST') {
                    const body = await request.json().catch(() => ({}));
                    const username = (body.username || '').trim();
                    const password = (body.password || '').trim();
                    const displayName = (body.displayName || '').trim();
                    const email = (body.email || '').trim();
                    const phone = (body.phone || '').trim();

                    if (!username || !password || !displayName || !email || !phone) {
                        return jsonResponse({ error: 'Please provide Username, Password, Display Name, Email Address, and Mobile Number.' }, 400);
                    }

                    const users = await getUsers(env);
                    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
                        return jsonResponse({ error: 'Username is already taken.' }, 400);
                    }
                    if (users.some(u => (u.email || '').toLowerCase() === email.toLowerCase())) {
                        return jsonResponse({ error: 'Email address is already registered to another user.' }, 400);
                    }

                    users.push({
                        username,
                        passwordHash: await hashPassword(password),
                        role: 'bde',
                        displayName,
                        email,
                        phone,
                        avatar: '',
                        status: 'active'
                    });
                    await saveUsers(env, users);
                    return jsonResponse({ status: 'success', username }, 200);
                }
            }

            // 13. Admin Only Route: POST /api/users/toggle-status
            if (path === '/api/users/toggle-status' && method === 'POST') {
                if (session.role !== 'admin') {
                    return jsonResponse({ error: 'Forbidden. Admin privileges required.' }, 403);
                }

                const body = await request.json().catch(() => ({}));
                const targetUsername = (body.username || '').trim();
                if (!targetUsername) return jsonResponse({ error: 'Missing username.' }, 400);
                if (targetUsername.toLowerCase() === 'ceo' || targetUsername.toLowerCase() === session.username.toLowerCase()) {
                    return jsonResponse({ error: 'Cannot deactivate default admin account or your active account.' }, 400);
                }

                const users = await getUsers(env);
                const targetUser = users.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
                if (!targetUser) return jsonResponse({ error: 'User not found.' }, 404);

                const newStatus = (targetUser.status || 'active') === 'active' ? 'inactive' : 'active';
                targetUser.status = newStatus;
                await saveUsers(env, users);
                return jsonResponse({ status: 'success', username: targetUsername, newStatus }, 200);
            }

            // 14. Admin Only Route: DELETE /api/users/:username
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

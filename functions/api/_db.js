// Shared Database and Auth helper for Cloudflare Pages Functions

export const DEFAULT_USERS = [
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

export const DEFAULT_LEADS = [
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

// In-memory fallback if KV is not yet bound
let MEMORY_STORE = {
    users: null,
    leads: null,
    sessions: {}
};

// SHA-256 password hashing matching Python hashlib.sha256
export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// JSON Response Helper with anti-caching headers
export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
    });
}

// Get Users list
export async function getUsers(env) {
    if (env && env.DB) {
        const data = await env.DB.get('users', 'json');
        if (data && Array.isArray(data)) return data;
        // Seed default users on first run
        await env.DB.put('users', JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
    if (!MEMORY_STORE.users) {
        MEMORY_STORE.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    }
    return MEMORY_STORE.users;
}

// Save Users list
export async function saveUsers(env, users) {
    if (env && env.DB) {
        await env.DB.put('users', JSON.stringify(users));
        return;
    }
    MEMORY_STORE.users = users;
}

// Get Leads list
export async function getLeads(env) {
    if (env && env.DB) {
        const data = await env.DB.get('leads', 'json');
        if (data && Array.isArray(data)) return data;
        // Seed default leads on first run
        await env.DB.put('leads', JSON.stringify(DEFAULT_LEADS));
        return DEFAULT_LEADS;
    }
    if (!MEMORY_STORE.leads) {
        MEMORY_STORE.leads = JSON.parse(JSON.stringify(DEFAULT_LEADS));
    }
    return MEMORY_STORE.leads;
}

// Save Leads list
export async function saveLeads(env, leads) {
    if (env && env.DB) {
        await env.DB.put('leads', JSON.stringify(leads));
        return;
    }
    MEMORY_STORE.leads = leads;
}

// Create Session Token (TTL: 7 days)
export async function createSession(env, user) {
    const token = crypto.randomUUID();
    const sessionData = {
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        createdAt: Date.now()
    };

    if (env && env.DB) {
        // Expiration in seconds (7 days = 604800s)
        await env.DB.put(`session:${token}`, JSON.stringify(sessionData), { expirationTtl: 604800 });
    } else {
        MEMORY_STORE.sessions[token] = sessionData;
    }

    return token;
}

// Get Session from Authorization header or URL token
export async function getSession(env, request) {
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

// Invalidate Session
export async function deleteSession(env, request) {
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

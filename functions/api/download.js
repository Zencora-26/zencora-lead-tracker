// Cloudflare Pages Function: GET /api/download (CSV / Excel format)
import { getSession, getLeads } from './_db.js';

export async function onRequestGet({ request, env }) {
    const session = await getSession(env, request);
    if (!session) {
        return new Response(JSON.stringify({ error: 'Unauthorized. Invalid or missing session token.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const allLeads = await getLeads(env);

    // Filter leads based on user role
    const filteredLeads = session.role === 'admin'
        ? allLeads
        : allLeads.filter(l => (l.assignedBde || '').trim().toLowerCase() === session.displayName.trim().toLowerCase());

    // Generate CSV data with UTF-8 BOM so Excel opens it with proper formatting and characters
    const headers = [
        "Lead ID",
        "Date Added",
        "Practice / Clinic Name",
        "Specialty",
        "EHR System",
        "Contact Person",
        "Contact Title",
        "Contact Email",
        "Contact Phone",
        "Outreach Channel",
        "Assigned BDE",
        "Lead Stage",
        "Est. Monthly Value ($)",
        "Follow-up Cadence",
        "Date Last Touch",
        "Next Action Date",
        "Notes"
    ];

    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    const rows = [headers.map(escapeCsv).join(',')];

    for (const lead of filteredLeads) {
        const row = [
            lead.id || '',
            lead.dateAdded || '',
            lead.name || '',
            lead.specialty || '',
            lead.ehrSystem || '',
            lead.contactName || '',
            lead.contactTitle || '',
            lead.contactEmail || '',
            lead.contactPhone || '',
            lead.outreachChannel || '',
            lead.assignedBde || '',
            lead.leadStage || '',
            lead.estValue || 0,
            lead.followUpStatus || '',
            lead.dateLastTouch || '',
            lead.nextActionDate || '',
            lead.notes || ''
        ];
        rows.push(row.map(escapeCsv).join(','));
    }

    const csvContent = '\uFEFF' + rows.join('\r\n');

    return new Response(csvContent, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="zencora_lead_tracker.csv"',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
}

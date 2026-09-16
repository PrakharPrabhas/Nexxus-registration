const config = require("../config/env");
const { generateUUID } = require("../utils/codeGenerator");

class SupabaseService {
  constructor() {
    // Accept either the project URL or the full REST URL so .env mistakes do not
    // produce confusing 'requested path is invalid' errors.
    this.baseUrl =
      String(config.supabaseUrl || "")
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/rest\/v1$/i, "") + "/rest/v1";
    this.secretKey = String(config.supabaseSecretKey || "").trim();
    this.codeToTeamMap = new Map();

    // Server-side in-memory backup cache
    this.memoryCache = {
      teams: [],
      app_users: [],
      team_members: [],
      announcements: [],
      support_tickets: [],
      problem_statements: [],
    };
  }

  getHeaders(preferReturn = false) {
    const headers = {
      // Supabase's current sb_secret_* keys are API keys, not JWTs.
      // Send them through apikey only; do not send sb_secret_* as Bearer tokens.
      apikey: this.secretKey,
      "Content-Type": "application/json",
    };
    if (preferReturn) {
      headers["Prefer"] = "return=representation";
    }
    return headers;
  }

  async checkConnection() {
    if (!config.supabaseUrl || !this.secretKey) {
      throw new Error(
        "Supabase configuration missing: set SUPABASE_URL and SUPABASE_SECRET_KEY in .env",
      );
    }
    const res = await fetch(`${this.baseUrl}/`, { headers: this.getHeaders() });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase connection failed (${res.status}): ${errText || "Check that SUPABASE_URL and SUPABASE_SECRET_KEY belong to the same project."}`,
      );
    }
    return { baseUrl: this.baseUrl };
  }

  registerTeamCode(code, team) {
    if (code && team) {
      this.codeToTeamMap.set(code.trim().toUpperCase(), team);
    }
  }

  /* ------------------- TEAMS ------------------- */
  async getTeams() {
    const res = await fetch(
      `${this.baseUrl}/teams?select=*&order=created_at.desc`,
      { headers: this.getHeaders() },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team read failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const data = await res.json();
    const remoteIds = new Set(data.map((d) => d.id));
    const pendingLocal = this.memoryCache.teams.filter(
      (t) => !remoteIds.has(t.id),
    );
    this.memoryCache.teams = [...pendingLocal, ...data];
    return this.memoryCache.teams;
  }

  async getTeamByCode(code) {
    if (!code) return null;
    const clean = code.trim().toUpperCase();
    const cleanAlnum = clean.replace(/[^A-Z0-9]/g, "");

    // 1. Check in-memory fast cache
    if (this.codeToTeamMap.has(clean)) {
      return this.codeToTeamMap.get(clean);
    }
    if (cleanAlnum && this.codeToTeamMap.has(cleanAlnum)) {
      return this.codeToTeamMap.get(cleanAlnum);
    }

    // 2. Search loaded teams
    const teams = await this.getTeams();
    const match = teams.find((t) => {
      const teamId = (t.team_id || "").toUpperCase();
      const teamName = (t.name || "").toUpperCase();
      const teamAbstract = (t.abstract || "").toUpperCase();

      if (
        teamId === clean ||
        teamName === clean ||
        teamAbstract.includes(clean)
      ) {
        return true;
      }

      // Fuzzy alphanumeric match (strips spaces, dashes, e.g. NEXX-26-X vs NEXXUS2026X or 6-char suffix)
      if (cleanAlnum.length >= 4) {
        const teamIdAlnum = teamId.replace(/[^A-Z0-9]/g, "");
        const teamNameAlnum = teamName.replace(/[^A-Z0-9]/g, "");
        const teamAbstractAlnum = teamAbstract.replace(/[^A-Z0-9]/g, "");

        if (
          teamIdAlnum === cleanAlnum ||
          teamNameAlnum === cleanAlnum ||
          teamAbstractAlnum.includes(cleanAlnum)
        ) {
          return true;
        }
      }
      return false;
    });

    if (match) {
      this.codeToTeamMap.set(clean, match);
      if (cleanAlnum) this.codeToTeamMap.set(cleanAlnum, match);
      return match;
    }

    // 3. Fallback: Check team_invitations table directly in Supabase
    try {
      const res = await fetch(
        `${this.baseUrl}/team_invitations?code=eq.${encodeURIComponent(clean)}&select=*,teams(*)`,
        {
          headers: this.getHeaders(),
        },
      );
      if (res.ok) {
        const invites = await res.json();
        if (invites.length > 0 && invites[0].teams) {
          const matchedTeam = invites[0].teams;
          this.codeToTeamMap.set(clean, matchedTeam);
          return matchedTeam;
        }
      }
    } catch (e) {}

    return null;
  }

  async createTeam(data) {
    const payload = {
      id: data.id || generateUUID(),
      team_id: data.team_id,
      name: data.name,
      track: data.track || "Unassigned",
      abstract: data.abstract || "",
      leader_id: data.leader_id,
      problem_statement_id: data.problem_statement_id || null,
      shortlisted_round: data.shortlisted_round ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${this.baseUrl}/teams`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team creation failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const created =
      Array.isArray(result) && result.length > 0 ? result[0] : payload;
    this.memoryCache.teams.unshift(created);
    return created;
  }

  /* ------------------- USERS ------------------- */
  async getUsers() {
    const res = await fetch(
      `${this.baseUrl}/app_users?select=*&order=created_at.desc`,
      { headers: this.getHeaders() },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase participant read failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const data = await res.json();
    const remoteIds = new Set(data.map((d) => d.id));
    const pendingLocal = this.memoryCache.app_users.filter(
      (u) => !remoteIds.has(u.id),
    );
    this.memoryCache.app_users = [...pendingLocal, ...data];
    return this.memoryCache.app_users;
  }

  async createUser(data) {
    let safeUsername = data.username || "";
    let passwordHash = data.password_hash;
    if (
      safeUsername.includes("|") ||
      !/^[a-zA-Z0-9_]+$/.test(safeUsername) ||
      safeUsername.length > 30
    ) {
      passwordHash = safeUsername;
      safeUsername = `nexx_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    } else if (!passwordHash) {
      passwordHash = "hash_sec_" + Date.now();
    }
    const payload = {
      id: data.id || generateUUID(),
      public_user_id: data.public_user_id,
      name: data.name,
      username: safeUsername,
      email: data.email.toLowerCase().trim(),
      password_hash: passwordHash,
      year: data.year || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${this.baseUrl}/app_users`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase participant creation failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const created =
      Array.isArray(result) && result.length > 0 ? result[0] : payload;
    this.memoryCache.app_users.unshift(created);
    return created;
  }

  async updateUser(userId, updates) {
    const payload = { ...updates, updated_at: new Date().toISOString() };
    const res = await fetch(
      `${this.baseUrl}/app_users?id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase participant update failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const updated =
      Array.isArray(result) && result.length > 0
        ? result[0]
        : { id: userId, ...payload };
    const idx = this.memoryCache.app_users.findIndex((u) => u.id === userId);
    if (idx >= 0)
      this.memoryCache.app_users[idx] = {
        ...this.memoryCache.app_users[idx],
        ...updated,
      };
    return idx >= 0 ? this.memoryCache.app_users[idx] : updated;
  }

  async deleteUser(userId) {
    const res = await fetch(
      `${this.baseUrl}/app_users?id=eq.${encodeURIComponent(userId)}`,
      { method: "DELETE", headers: this.getHeaders(true) },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase delete participant failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    let deleted = [];
    try {
      deleted = await res.json();
    } catch (_) {}
    if (Array.isArray(deleted) && deleted.length === 0)
      throw new Error(
        "Participant was not found in Supabase; nothing was deleted.",
      );
    this.memoryCache.app_users = this.memoryCache.app_users.filter(
      (u) => u.id !== userId,
    );
    this.memoryCache.team_members = this.memoryCache.team_members.filter(
      (m) => m.user_id !== userId,
    );
    return true;
  }

  /* ------------------- TEAM MEMBERS ------------------- */
  async getTeamMembers() {
    const res = await fetch(
      `${this.baseUrl}/team_members?select=*&order=joined_at.asc`,
      {
        headers: this.getHeaders(),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team member read failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const data = await res.json();
    this.memoryCache.team_members = data;
    return data;
  }

  async getMembersByTeamId(teamId) {
    const all = await this.getTeamMembers();
    return all.filter((m) => m.team_id === teamId);
  }

  async addTeamMember(data) {
    const payload = {
      id: data.id || generateUUID(),
      team_id: data.team_id,
      user_id: data.user_id,
      role: data.role || "MEMBER",
      status: data.status || "ACTIVE",
      joined_at: new Date().toISOString(),
    };
    const res = await fetch(`${this.baseUrl}/team_members`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team membership creation failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const created =
      Array.isArray(result) && result.length > 0 ? result[0] : payload;
    this.memoryCache.team_members.push(created);
    return created;
  }

  async updateTeamMemberByUserId(userId, updates) {
    const res = await fetch(
      `${this.baseUrl}/team_members?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(updates),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team membership update failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const updated =
      Array.isArray(result) && result.length > 0 ? result[0] : updates;
    const idx = this.memoryCache.team_members.findIndex(
      (m) => m.user_id === userId,
    );
    if (idx >= 0)
      this.memoryCache.team_members[idx] = {
        ...this.memoryCache.team_members[idx],
        ...updated,
      };
    return idx >= 0 ? this.memoryCache.team_members[idx] : updated;
  }

  /* ------------------- ANNOUNCEMENTS ------------------- */
  async getAnnouncements() {
    const res = await fetch(
      `${this.baseUrl}/announcements?select=*&order=created_at.desc`,
      { headers: this.getHeaders() },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase announcements read failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const data = await res.json();
    const remoteIds = new Set(data.map((d) => d.id));
    const pendingLocal = this.memoryCache.announcements.filter(
      (a) => !remoteIds.has(a.id),
    );
    this.memoryCache.announcements = [...pendingLocal, ...data];
    return this.memoryCache.announcements;
  }

  async createAnnouncement(data) {
    const payload = {
      id: data.id || generateUUID(),
      title: data.title,
      category: data.category || "Schedule",
      priority: data.priority || "High",
      track: data.track || "All Tracks",
      content: data.content,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${this.baseUrl}/announcements`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase announcement creation failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const created =
      Array.isArray(result) && result.length ? result[0] : payload;
    this.memoryCache.announcements.unshift(created);
    return created;
  }

  async updateAnnouncement(id, updates) {
    const payload = {};
    for (const k of ["title", "category", "priority", "track", "content"])
      if (updates[k] !== undefined) payload[k] = updates[k];
    payload.updated_at = new Date().toISOString();
    const res = await fetch(
      `${this.baseUrl}/announcements?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase announcement update failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const updated =
      Array.isArray(result) && result.length ? result[0] : { id, ...payload };
    const idx = this.memoryCache.announcements.findIndex((a) => a.id === id);
    if (idx >= 0)
      this.memoryCache.announcements[idx] = {
        ...this.memoryCache.announcements[idx],
        ...updated,
      };
    return idx >= 0 ? this.memoryCache.announcements[idx] : updated;
  }

  async deleteAnnouncement(id) {
    const res = await fetch(
      `${this.baseUrl}/announcements?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: this.getHeaders(true) },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase announcement deletion failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    let deleted = [];
    try {
      deleted = await res.json();
    } catch (_) {}
    if (Array.isArray(deleted) && deleted.length === 0)
      throw new Error(
        "Announcement was not found in Supabase; nothing was deleted.",
      );
    this.memoryCache.announcements = this.memoryCache.announcements.filter(
      (a) => a.id !== id,
    );
    return true;
  }

  /* ------------------- SUPPORT TICKETS ------------------- */
  async getSupportTickets() {
    const res = await fetch(
      `${this.baseUrl}/support_tickets?select=*&order=created_at.desc`,
      { headers: this.getHeaders() },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase support ticket read failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const data = await res.json();
    this.memoryCache.support_tickets = data;
    return data;
  }

  async createSupportTicket(data) {
    const payload = {
      id: generateUUID(),
      ticket_id: `TCK-${Math.random().toString(16).substring(2, 8).toUpperCase()}`,
      name: data.name,
      email: data.email,
      category: data.category || "General Support",
      message: data.message,
      status: "OPEN",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${this.baseUrl}/support_tickets`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase support ticket creation failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const created =
      Array.isArray(result) && result.length ? result[0] : payload;
    this.memoryCache.support_tickets.unshift(created);
    return created;
  }

  async updateSupportTicket(id, status) {
    const res = await fetch(
      `${this.baseUrl}/support_tickets?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify({ status, updated_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase support ticket update failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const updated =
      Array.isArray(result) && result.length ? result[0] : { id, status };
    const idx = this.memoryCache.support_tickets.findIndex((t) => t.id === id);
    if (idx >= 0)
      this.memoryCache.support_tickets[idx] = {
        ...this.memoryCache.support_tickets[idx],
        ...updated,
      };
    return true;
  }

  /* ------------------- PROBLEM STATEMENTS ------------------- */
  async getProblems(admin = false) {
    const query = admin
      ? "order=created_at.desc"
      : "published=eq.true&order=created_at.desc";
    const res = await fetch(
      `${this.baseUrl}/problem_statements?select=*&${query}`,
      { headers: this.getHeaders() },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase challenge read failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const data = await res.json();
    this.memoryCache.problem_statements = data;
    return data;
  }

  async createProblem(data) {
    const payload = {
      id: data.id || generateUUID(),
      code: data.code || `PS-${Date.now().toString().slice(-4)}`,
      title: data.title,
      summary: data.summary || "",
      description: data.description || "",
      track: data.track || "General",
      difficulty: data.difficulty || "Intermediate",
      technologies: data.technologies || "",
      constraints: data.constraints || "",
      expected_outcome: data.expected_outcome || "",
      judging_focus: data.judging_focus || "",
      published: data.published !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${this.baseUrl}/problem_statements`, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase challenge creation failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const created =
      Array.isArray(result) && result.length ? result[0] : payload;
    this.memoryCache.problem_statements = [
      created,
      ...(this.memoryCache.problem_statements || []),
    ];
    return created;
  }

  async updateProblem(id, updates) {
    const payload = { ...updates, updated_at: new Date().toISOString() };
    delete payload.id;
    const res = await fetch(
      `${this.baseUrl}/problem_statements?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase challenge update failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const result = await res.json();
    const updated =
      Array.isArray(result) && result[0] ? result[0] : { id, ...payload };
    this.memoryCache.problem_statements = (
      this.memoryCache.problem_statements || []
    ).map((p) => (p.id === id ? { ...p, ...updated } : p));
    return updated;
  }

  async deleteProblem(id) {
    const res = await fetch(
      `${this.baseUrl}/problem_statements?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: this.getHeaders(true) },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase challenge deletion failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    let deleted = [];
    try {
      deleted = await res.json();
    } catch (_) {}
    if (Array.isArray(deleted) && deleted.length === 0)
      throw new Error(
        "Challenge was not found in Supabase; nothing was deleted.",
      );
    this.memoryCache.problem_statements = (
      this.memoryCache.problem_statements || []
    ).filter((p) => p.id !== id);
    return true;
  }

  async updateTeam(id, updates) {
    const payload = {};
    for (const k of [
      "name",
      "track",
      "abstract",
      "problem_statement_id",
      "shortlisted_round",
    ]) {
      if (updates[k] !== undefined) payload[k] = updates[k];
    }
    payload.updated_at = new Date().toISOString();

    const res = await fetch(
      `${this.baseUrl}/teams?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team update failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    const a = await res.json();
    const updated = Array.isArray(a) && a[0] ? a[0] : { id, ...payload };
    this.memoryCache.teams = (this.memoryCache.teams || []).map((t) =>
      t.id === id ? { ...t, ...updated } : t,
    );
    return updated;
  }

  async deleteTeam(id) {
    const res = await fetch(
      `${this.baseUrl}/teams?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: this.getHeaders(true) },
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Supabase team deletion failed (${res.status}): ${errText || "Unknown error"}`,
      );
    }
    let deleted = [];
    try {
      deleted = await res.json();
    } catch (_) {}
    if (Array.isArray(deleted) && deleted.length === 0)
      throw new Error("Team was not found in Supabase; nothing was deleted.");
    this.memoryCache.teams = (this.memoryCache.teams || []).filter(
      (t) => t.id !== id,
    );
    this.memoryCache.team_members = (
      this.memoryCache.team_members || []
    ).filter((m) => m.team_id !== id);
    return true;
  }
}

module.exports = new SupabaseService();

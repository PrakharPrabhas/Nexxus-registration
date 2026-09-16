const express = require("express");
const router = express.Router();
const supabaseService = require("../services/supabaseService");
const { encrypt } = require("../utils/crypto");
const {
  generateTeamCode,
  generatePublicId,
} = require("../utils/codeGenerator");
const { registrationLimiter } = require("../middleware/security");

const MAX_MEMBERS_PER_TEAM = 4;

/**
 * POST /api/teams/create
 * Team Leader creates squad, generates unique code, encrypts sensitive telemetry
 */
router.post("/create", registrationLimiter, async (req, res, next) => {
  try {
    const {
      teamName,
      track = "Unassigned",
      abstract = "",
      leaderName,
      leaderEmail,
      leaderCollege = "",
      leaderRoll,
      leaderCourse,
      leaderBranch,
      leaderSection,
      leaderPhone,
      leaderYear,
    } = req.body;

    // Validate required fields
    if (
      !teamName ||
      !leaderName ||
      !leaderEmail ||
      !leaderRoll ||
      !leaderCourse ||
      !leaderBranch ||
      !leaderSection ||
      !leaderPhone ||
      !leaderYear
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing mandatory fields. All fields marked with * are required.",
      });
    }

    // 1. Generate unique verification code
    const uniqueCode = generateTeamCode("NEXX-26");
    const teamPublicId = `TEAM-26-${Date.now().toString(36).toUpperCase()}`;

    // 2. Encrypt sensitive telemetry with AES-256-GCM
    const encryptedRoll = encrypt(leaderRoll);
    const encryptedPhone = encrypt(leaderPhone);
    const encryptedAbstract = abstract ? encrypt(abstract) : "";

    // 3. Format username metadata with APPROVED status for squad founder
    const userMetadata = `${encryptedRoll}|${leaderCollege}|${encryptedPhone}|${leaderCourse}|${leaderBranch}|${leaderSection}|APPROVED`;

    // 4. Create Leader User
    const user = await supabaseService.createUser({
      public_user_id: generatePublicId("USER-26"),
      name: leaderName,
      email: leaderEmail,
      username: userMetadata,
      year: leaderYear,
    });

    // 5. Create Team Record
    // Store verification code in abstract tag for instant lookup
    const abstractWithCode = `[CODE: ${uniqueCode}] ${encryptedAbstract}`;
    const team = await supabaseService.createTeam({
      team_id: teamPublicId,
      name: teamName,
      track: track || "Unassigned",
      abstract: abstractWithCode,
      leader_id: user.id,
    });

    // Register team code in lookup index
    supabaseService.registerTeamCode(uniqueCode, team);

    // 6. Link Leader as initial member
    await supabaseService.addTeamMember({
      team_id: team.id,
      user_id: user.id,
      role: "LEADER",
      status: "ACTIVE",
    });

    return res.status(201).json({
      success: true,
      message: "Squad successfully registered",
      uniqueCode: uniqueCode,
      team: {
        id: team.id,
        team_id: teamPublicId,
        name: teamName,
        track: track || "Unassigned",
        leaderName: leaderName,
        leaderEmail: leaderEmail,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/teams/verify/:code
 * Verify squad code and return current capacity status (< 4)
 */
router.get("/verify/:code", async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return res
        .status(400)
        .json({ success: false, error: "Team code is required" });
    }

    const team = await supabaseService.getTeamByCode(code);
    if (!team) {
      return res.status(404).json({
        success: false,
        error:
          "Invalid or unrecognized team code. Please check with your team leader.",
      });
    }

    const [members, users] = await Promise.all([
      supabaseService.getMembersByTeamId(team.id),
      supabaseService.getUsers(),
    ]);

    const memberCount = members.length;
    const isFull = memberCount >= MAX_MEMBERS_PER_TEAM;
    const remainingSlots = Math.max(0, MAX_MEMBERS_PER_TEAM - memberCount);

    const memberDetails = members.map((m) => {
      const u = users.find((user) => user.id === m.user_id);
      let course = "B.Tech";
      let branch = "CSE";
      let section = "A";
      let status = m.status || "ACTIVE";

      if (u) {
        const meta = u.password_hash || u.username || "";
        if (meta.includes("|")) {
          const parts = meta.split("|");
          course = parts[3] || "B.Tech";
          branch = parts[4] || "CSE";
          section = parts[5] || "A";
          status = parts[6] || status;
        }
      }

      return {
        id: m.id,
        user_id: m.user_id,
        name: u ? u.name : "Squad Member",
        role: m.role || "MEMBER",
        course,
        branch,
        section,
        year: u?.year || "",
        status,
      };
    });

    return res.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        track: team.track,
        team_id: team.team_id || code,
        memberCount: memberCount,
        maxMembers: MAX_MEMBERS_PER_TEAM,
        remainingSlots: remainingSlots,
        isFull: isFull,
        members: memberDetails,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/teams/join
 * Teammate joins squad. Strictly enforces max 4 member limit and encrypts student data.
 */
router.post("/join", registrationLimiter, async (req, res, next) => {
  try {
    const {
      code,
      name,
      email,
      college = "",
      rollNo,
      phone,
      course,
      branch,
      section,
      year,
    } = req.body;

    if (
      !code ||
      !name ||
      !email ||
      !rollNo ||
      !phone ||
      !course ||
      !branch ||
      !section ||
      !year
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing mandatory fields. All fields marked with * are required.",
      });
    }

    // 1. Verify Team existence
    const team = await supabaseService.getTeamByCode(code);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: "Invalid or unrecognized team verification code.",
      });
    }

    // 2. Strict 4-member limit enforcement
    const currentMembers = await supabaseService.getMembersByTeamId(team.id);
    if (currentMembers.length >= MAX_MEMBERS_PER_TEAM) {
      return res.status(400).json({
        success: false,
        error: `SQUAD_CAPACITY_EXCEEDED: Team "${team.name}" already has ${MAX_MEMBERS_PER_TEAM} members (maximum capacity reached).`,
      });
    }

    // 3. Encrypt sensitive telemetry with PENDING approval status
    const encryptedRoll = encrypt(rollNo);
    const encryptedPhone = encrypt(phone);
    const userMetadata = `${encryptedRoll}|${college}|${encryptedPhone}|${course}|${branch}|${section}|PENDING`;

    // 4. Create User
    const user = await supabaseService.createUser({
      public_user_id: generatePublicId("USER-26"),
      name: name,
      email: email,
      username: userMetadata,
      year,
    });

    // 5. Add to Team Members
    const member = await supabaseService.addTeamMember({
      team_id: team.id,
      user_id: user.id,
      role: "MEMBER",
      status: "ACTIVE",
    });

    return res.status(201).json({
      success: true,
      message: `Successfully joined ${team.name}`,
      team: {
        id: team.id,
        name: team.name,
        track: team.track,
        team_id: team.team_id,
      },
      member: {
        id: user.id,
        name: name,
        role: "MEMBER",
        memberCount: currentMembers.length + 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

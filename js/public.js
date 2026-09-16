const fieldValue = (...ids) => {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return (el.value || "").trim();
  }
  return "";
};
const $ = (s) => document.querySelector(s);
const toast = (m, type = "ok") => {
  const t = $("#toast");
  t.textContent = m;
  t.style.borderColor =
    type === "error" ? "rgba(255,93,115,.5)" : "var(--border)";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
};
function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function openModal() {
  $("#modal").classList.add("show");
}
function closeModal() {
  $("#modal").classList.remove("show");
}
window.closeModal = closeModal;
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-public-action]");
  if (button?.dataset.publicAction === "close-modal") closeModal();
  if (button?.dataset.publicAction === "view-problem")
    window.viewProblem(button.dataset.id);
});
let problems = [];
let selectedTrack = "ALL";
async function loadProblems() {
  try {
    const d = await API.problems();
    problems = d.problems || [];
    $("#stat-problems").textContent = problems.length;
    renderFilters();
    renderProblems();
  } catch (e) {
    $("#problem-list").innerHTML =
      '<div class="empty">Challenges are temporarily unavailable.</div>';
  }
}
function renderFilters() {
  const tracks = [
    "ALL",
    ...new Set(problems.map((p) => p.track).filter(Boolean)),
  ];
  $("#track-filters").innerHTML = tracks
    .map(
      (t) =>
        `<button class="filter ${t === selectedTrack ? "active" : ""}" data-track="${esc(t)}">${t === "ALL" ? "All challenges" : esc(t)}</button>`,
    )
    .join("");
  document.querySelectorAll(".filter").forEach(
    (b) =>
      (b.onclick = () => {
        selectedTrack = b.dataset.track;
        renderFilters();
        renderProblems();
      }),
  );
}
function renderProblems() {
  const list = problems.filter(
    (p) => selectedTrack === "ALL" || p.track === selectedTrack,
  );
  $("#problem-list").innerHTML = list.length
    ? list
        .map(
          (p) =>
            `<article class="card problem-card"><div class="problem-meta"><span class="badge accent">${esc(p.code || "PS")}</span><span class="badge">${esc(p.track || "General")}</span>${p.difficulty ? `<span class="badge">${esc(p.difficulty)}</span>` : ""}</div><h3>${esc(p.title)}</h3><p>${esc(p.summary || p.description || "Challenge details will be published soon.")}</p><div class="track-note">${p.technologies ? `Suggested: ${esc(p.technologies)}` : ""}</div><div style="margin-top:16px"><button class="btn ghost" data-public-action="view-problem" data-id="${esc(p.id)}">View problem</button></div></article>`,
        )
        .join("")
    : '<div class="empty">No published challenges in this filter.</div>';
}
window.viewProblem = (id) => {
  const p = problems.find((x) => String(x.id) === String(id));
  if (!p) return;
  $("#modal-eyebrow").textContent = "Problem statement";
  $("#success-team").textContent = p.title;
  $("#success-code").textContent = p.code || "Problem statement";
  $("#problem-details").innerHTML =
    `<div class=\"problem-meta\"><span class=\"badge accent\">${esc(p.track || "General")}</span><span class=\"badge\">${esc(p.difficulty || "Intermediate")}</span></div><p class=\"muted\" style=\"margin-top:12px;white-space:pre-line\">${esc(p.description || p.summary || "Details coming soon.")}</p>${p.constraints ? `<h4 style=\"margin-top:16px\">Constraints</h4><p class=\"muted\" style=\"white-space:pre-line;font-size:13px;margin-top:5px\">${esc(p.constraints)}</p>` : ""}${p.expected_outcome ? `<h4 style=\"margin-top:16px\">Expected outcome</h4><p class=\"muted\" style=\"white-space:pre-line;font-size:13px;margin-top:5px\">${esc(p.expected_outcome)}</p>` : ""}${p.judging_focus ? `<h4 style=\"margin-top:16px\">Judging focus</h4><p class=\"muted\" style=\"white-space:pre-line;font-size:13px;margin-top:5px\">${esc(p.judging_focus)}</p>` : ""}`;
  $("#whatsapp").style.display = "none";
  $("#copy-code").style.display = "none";
  $("#success-subtitle").textContent = "Problem statement details";
  $("#success-next").textContent =
    "Tracks are filters; teams choose the actual problem statement.";
  openModal();
};
$("#create-team-form").onsubmit = async (e) => {
  e.preventDefault();
  const b = $("#create-btn");
  b.disabled = true;
  b.innerHTML = '<span class="spinner"></span> Creating…';
  try {
    const d = await API.createTeam({
      teamName: $("#team-name").value.trim(),
      track: "",
      abstract: $("#team-abstract").value.trim(),
      leaderName: $("#leader-name").value.trim(),
      leaderEmail: $("#leader-email").value.trim().toLowerCase(),
      leaderCollege: fieldValue("leader-institution", "leader-Institute Name "),
      leaderRoll: fieldValue("leader-roll"),
      leaderCourse: fieldValue("leader-course"),
      leaderBranch: fieldValue("leader-branch"),
      leaderSection: fieldValue("leader-section"),
      leaderPhone: fieldValue("leader-phone"),
      leaderYear: fieldValue("leader-Year"),
    });
    $("#modal-eyebrow").textContent = "Team created";
    $("#success-team").textContent = d.team?.name || "Team";
    $("#success-code").textContent = d.uniqueCode || "—";
    $("#problem-details").innerHTML = "";
    $("#success-subtitle").textContent =
      "Your team is registered. Share this code with your teammates.";
    $("#success-next").textContent =
      "Next: explore challenges and choose a problem statement when your team is ready.";
    $("#whatsapp").style.display = "inline-flex";
    $("#whatsapp").href =
      "https://wa.me/?text=" +
      encodeURIComponent(
        `Join my Nexxathon team "${d.team?.name || ""}". Team code: ${d.uniqueCode}`,
      );
    $("#copy-code").onclick = () =>
      navigator.clipboard
        .writeText(d.uniqueCode)
        .then(() => toast("Team code copied"));
    openModal();
    e.target.reset();
    toast("Team created successfully");
  } catch (err) {
    toast(err.message, "error");
  } finally {
    b.disabled = false;
    b.textContent = "Create team";
  }
};
let verifiedTeam = null;
$("#verify-btn").onclick = async () => {
  const b = $("#verify-btn");
  b.disabled = true;
  try {
    verifiedTeam = await API.verifyTeam($("#join-code").value.trim());
    const t = verifiedTeam.team;
    const full = t.memberCount >= t.maxMembers;
    $("#team-preview").innerHTML =
      `<div class="notice"><strong>${esc(t.name)}</strong><br>${esc(t.team_id)} · ${esc(t.track || "No problem selected yet")}<br><br><strong>${t.memberCount}/${t.maxMembers}</strong> members</div><div class="roster">${(t.members || []).map((m) => `<div class="roster-row"><span>${esc(m.name)} <small class="muted">${esc(m.role)}</small></span><span class="badge ${m.status === "PENDING" ? "warning" : "success"}">${esc(m.status)}</span></div>`).join("")}</div>`;
    $("#team-preview").style.display = "block";
    $("#member-fields").style.display = full ? "none" : "grid";
    if (full) toast("This team is full", "error");
    else toast("Team verified");
  } catch (err) {
    verifiedTeam = null;
    $("#team-preview").style.display = "none";
    $("#member-fields").style.display = "none";
    toast(err.message, "error");
  } finally {
    b.disabled = false;
    b.textContent = "Verify team";
  }
};
$("#join-form").onsubmit = async (e) => {
  e.preventDefault();
  if (!verifiedTeam) return toast("Verify the team code first", "error");
  const b = $("#join-btn");
  b.disabled = true;
  try {
    const d = await API.joinTeam({
      code: $("#join-code").value.trim(),
      name: $("#member-name").value.trim(),
      email: $("#member-email").value.trim().toLowerCase(),
      college: fieldValue("member-institution", "member-Institute Name "),
      rollNo: fieldValue("member-roll"),
      phone: fieldValue("member-phone"),
      course: fieldValue("member-course"),
      branch: fieldValue("member-branch", "member-Branch"),
      section: fieldValue("member-section"),
      year: fieldValue("member-year", "member-Year"),
    });
    toast("You joined the team");
    e.target.reset();
    $("#member-fields").style.display = "none";
    $("#team-preview").style.display = "none";
  } catch (err) {
    toast(err.message, "error");
  } finally {
    b.disabled = false;
    b.textContent = "Join team";
  }
};
$("#status-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const d = await API.status($("#status-query").value.trim());
    const x = d.type === "TEAM" ? d.team : d.student;
    $("#status-result").innerHTML =
      `<div class="notice"><strong>${esc(x.name)}</strong><br>Status: ${esc(x.status || "REGISTERED")}<br>${x.team ? `Team: ${esc(x.team.name)} · ${esc(x.team.team_id)}` : x.team_id ? `Team code: ${esc(x.team_id)}` : "No team assigned yet"}</div>`;
  } catch (err) {
    $("#status-result").innerHTML =
      `<div class="notice" style="border-color:rgba(255,93,115,.3)">${esc(err.message)}</div>`;
  }
};
async function loadUpdates() {
  try {
    const d = await API.announcements();
    const a = d.announcements || [];
    $("#updates-list").innerHTML = a.length
      ? a
          .slice(0, 6)
          .map(
            (x) =>
              `<article class="card form-card"><div class="problem-meta"><span class="badge ${x.priority === "Critical" ? "danger" : x.priority === "High" ? "warning" : "accent"}">${esc(x.priority || "Update")}</span><span class="badge">${esc(x.category || "General")}</span></div><h3>${esc(x.title)}</h3><p class="muted" style="margin-top:7px;font-size:13px">${esc(x.content)}</p></article>`,
          )
          .join("")
      : '<div class="empty">No updates yet.</div>';
  } catch (e) {
    $("#updates-list").innerHTML =
      '<div class="empty">Updates are temporarily unavailable.</div>';
  }
}
$("#support-form").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await API.support({
      name: $("#support-name").value.trim(),
      email: $("#support-email").value.trim(),
      category: $("#support-category").value,
      message: $("#support-message").value.trim(),
    });
    e.target.reset();
    toast("Support request sent");
  } catch (err) {
    toast(err.message, "error");
  }
};
loadProblems();
loadUpdates();

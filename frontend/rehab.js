const { useState, useEffect, useRef, useMemo } = React;

function RehabBodyMapSVG({ injuries = [], selectedInjuryId, onSelectInjury, isDark = true }) {
  const strokeCol = isDark ? "#475569" : "#94a3b8";
  const bodyFill = isDark ? "rgba(30, 41, 59, 0.55)" : "rgba(226, 232, 240, 0.7)";
  const labelCol = isDark ? "#cbd5e1" : "#334155";

  const colorMap = {
    red: { fill: "#f43f5e", ring: "rgba(244, 63, 94, 0.35)" },
    amber: { fill: "#f59e0b", ring: "rgba(245, 158, 11, 0.35)" },
    green: { fill: "#10b981", ring: "rgba(16, 185, 129, 0.35)" },
  };

  const getPinPos = (inj) => {
    const reg = inj.body_region || "full_body";
    const side = (inj.side || "bilateral").toLowerCase();
    // Front view (center x=110) and Back view (center x=270)
    if (reg === "fingers") {
      return side === "left"
        ? [{ x: 162, y: 185, label: "L Fingers" }]
        : side === "right"
        ? [{ x: 58, y: 185, label: "R Fingers" }]
        : [
            { x: 58, y: 185, label: "R Fingers" },
            { x: 162, y: 185, label: "L Fingers" },
          ];
    }
    if (reg === "toe_foot") {
      return side === "left"
        ? [{ x: 132, y: 344, label: "L Toe/Foot" }]
        : [{ x: 88, y: 344, label: "R Big Toe" }];
    }
    if (reg === "knee") {
      return side === "left"
        ? [{ x: 134, y: 262, label: "L Knee" }]
        : [{ x: 84, y: 262, label: "R Knee LCL" }];
    }
    if (reg === "calf_achilles") {
      // Back silhouette (x=270)
      return side === "right"
        ? [{ x: 292, y: 294, label: "R Calf" }]
        : [{ x: 248, y: 294, label: "L Upper Calf" }];
    }
    if (reg === "hamstring") {
      // Back silhouette (x=270)
      return side === "right"
        ? [{ x: 290, y: 226, label: "R Hamstring" }]
        : [{ x: 250, y: 226, label: "L Hamstring" }];
    }
    return [{ x: 110, y: 130, label: "Core/Posture" }];
  };

  return (
    <svg viewBox="0 0 380 370" className="w-full max-w-[380px] mx-auto select-none">
      {/* Labels */}
      <text x="110" y="18" textAnchor="middle" fill={labelCol} fontSize="11" fontWeight="700">
        FRONT (Fingers · Knee · Toe)
      </text>
      <text x="270" y="18" textAnchor="middle" fill={labelCol} fontSize="11" fontWeight="700">
        BACK (Hamstring · Upper Calf)
      </text>

      {/* Front Silhouette (center x=110) */}
      <g stroke={strokeCol} strokeWidth="2" fill={bodyFill} strokeLinejoin="round">
        <circle cx="110" cy="48" r="16" />
        <path d="M84,74 Q110,68 136,74 L144,122 L134,174 L86,174 L76,122 Z" />
        <path d="M84,76 L62,134 L56,184 L65,186 L74,140 L84,96" />
        <path d="M136,76 L158,134 L164,184 L155,186 L146,140 L136,96" />
        <path d="M88,174 L82,258 L84,336 L96,342 L100,334 L98,258 L108,186" />
        <path d="M132,174 L138,258 L136,336 L124,342 L120,334 L122,258 L112,186" />
      </g>

      {/* Back Silhouette (center x=270) */}
      <g stroke={strokeCol} strokeWidth="2" fill={bodyFill} strokeLinejoin="round">
        <circle cx="270" cy="48" r="16" />
        <path d="M244,74 Q270,68 296,74 L304,122 L294,174 L246,174 L236,122 Z" />
        <path d="M244,76 L222,134 L216,184 L225,186 L234,140 L244,96" />
        <path d="M296,76 L318,134 L324,184 L315,186 L306,140 L296,96" />
        <path d="M248,174 L242,258 L244,336 L256,342 L260,334 L258,258 L268,186" />
        <path d="M292,174 L298,258 L296,336 L284,342 L280,334 L282,258 L272,186" />
      </g>

      {/* Interactive Injury Hotspots */}
      {injuries
        .filter((inj) => inj.status === "active")
        .map((inj) => {
          const col = colorMap[inj.triage?.status_color || "amber"] || colorMap.amber;
          const isSel = inj.id === selectedInjuryId;
          const pins = getPinPos(inj);
          return pins.map((pin, idx) => (
            <g
              key={`${inj.id}-${idx}`}
              onClick={() => onSelectInjury && onSelectInjury(inj.id)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={pin.x} cy={pin.y} r={isSel ? 17 : 13} fill={col.ring} />
              <circle
                cx={pin.x}
                cy={pin.y}
                r={isSel ? 9 : 7}
                fill={col.fill}
                stroke="#ffffff"
                strokeWidth={isSel ? "2.5" : "1.5"}
              />
              <title>{`${inj.title} (${inj.triage?.readiness_label || ""})`}</title>
            </g>
          ));
        })}
    </svg>
  );
}

function ExerciseVisualDiagram({ visualKey, isDark = true, isWorking = false }) {
  const bg = isDark ? "rgba(15, 23, 42, 0.75)" : "#f8fafc";
  const fg = isDark ? "#cbd5e1" : "#334155";
  const accent = isWorking ? "#10b981" : "#6366f1";
  const warn = "#f59e0b";

  const renderShape = () => {
    switch (visualKey) {
      case "finger_glides":
      case "finger_h_tape":
      case "extensor_spread":
        return (
          <g>
            {/* Palm & 4 digits showing hook / open-hand posture */}
            <rect x="75" y="95" width="50" height="45" rx="10" fill="none" stroke={fg} strokeWidth="2.5" />
            <line x1="82" y1="95" x2="82" y2="48" stroke={fg} strokeWidth="4" strokeLinecap="round" />
            <line x1="95" y1="95" x2="95" y2="42" stroke={fg} strokeWidth="4" strokeLinecap="round" />
            <path d="M108,95 L108,58 L114,48" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
            <line x1="120" y1="95" x2="120" y2="56" stroke={fg} strokeWidth="4" strokeLinecap="round" />
            {visualKey === "finger_h_tape" ? (
              <rect x="102" y="72" width="12" height="10" rx="2" fill={warn} opacity="0.85" />
            ) : (
              <circle cx="108" cy="82" r="5" fill={accent} opacity="0.8" />
            )}
            <text x="100" y="25" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
              {visualKey === "finger_h_tape"
                ? "H-Tape Support @ Proximal Phalanx"
                : visualKey === "extensor_spread"
                ? "Band Spread — Antagonist Balance"
                : "Hook -> Tabletop -> Open Glide"}
            </text>
          </g>
        );
      case "open_hand_edge":
        return (
          <g>
            {/* 20mm wooden edge block */}
            <rect x="35" y="42" width="130" height="16" rx="3" fill={warn} opacity="0.35" stroke={warn} strokeWidth="2" />
            <path d="M65,58 L65,92 L95,126 L130,126" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
            <path d="M85,58 L85,96" fill="none" stroke={fg} strokeWidth="3.5" strokeLinecap="round" />
            <path d="M105,58 L105,96" fill="none" stroke={fg} strokeWidth="3.5" strokeLinecap="round" />
            <text x="100" y="26" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
              20mm Edge • Open-Hand / 3-Finger Drag
            </text>
            <text x="100" y="144" textAnchor="middle" fill={fg} fontSize="9">
              Feet on floor • 30–50% tension • NO closed crimp
            </text>
          </g>
        );
      case "toe_tape":
      case "toe_rom":
      case "toe_yoga":
      case "short_foot":
        return (
          <g>
            {/* Foot profile & 1st MTP alignment */}
            <path d="M40,108 L112,108 Q138,108 158,98 L164,104 Q142,118 110,118 L40,118 Z" fill="none" stroke={fg} strokeWidth="2.5" />
            <circle cx="132" cy="108" r="8" fill={accent} opacity="0.3" stroke={accent} strokeWidth="2" />
            {visualKey === "toe_tape" && (
              <path d="M85,98 L132,116 L154,102" fill="none" stroke={warn} strokeWidth="3" strokeDasharray="4 2" />
            )}
            {visualKey === "short_foot" && (
              <path d="M72,108 Q98,92 126,108" fill="none" stroke={accent} strokeWidth="3" />
            )}
            <text x="100" y="28" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
              {visualKey === "toe_tape"
                ? "Figure-8 Plantar Straps Block Extension"
                : visualKey === "toe_yoga"
                ? "Isolate 1st Toe Press vs. Toes 2–5"
                : visualKey === "short_foot"
                ? "Lift Medial Arch (Toes Stay Long)"
                : "Active Pain-Free 1st MTP Glide"}
            </text>
          </g>
        );
      case "clamshell":
      case "wall_sit":
      case "step_down":
      case "single_leg_rdl":
      case "copenhagen":
        return (
          <g>
            {visualKey === "clamshell" ? (
              <>
                <path d="M45,105 L95,105 L128,125" fill="none" stroke={fg} strokeWidth="4" strokeLinecap="round" />
                <path d="M95,105 L138,76 L128,125" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="112" y1="86" x2="112" y2="112" stroke={warn} strokeWidth="3" strokeDasharray="3 2" />
              </>
            ) : visualKey === "wall_sit" ? (
              <>
                <line x1="48" y1="28" x2="48" y2="132" stroke={fg} strokeWidth="3" />
                <path d="M62,50 L62,92 L106,92 L106,130" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
              </>
            ) : (
              <>
                <rect x="40" y="114" width="60" height="16" rx="2" fill={warn} opacity="0.3" stroke={warn} strokeWidth="2" />
                <path d="M72,42 L72,78 L66,114" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
                <path d="M72,78 L112,126" fill="none" stroke={fg} strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="68" cy="96" r="6" fill={accent} opacity="0.35" stroke={accent} strokeWidth="2" />
              </>
            )}
            <text x="100" y="24" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
              {visualKey === "clamshell"
                ? "Glute Medius Open • Pelvis Stacked"
                : visualKey === "wall_sit"
                ? "Vertical Shins • 60–75° Isometric"
                : "Knee Aligned Over 2nd Toe (Zero Varus)"}
            </text>
          </g>
        );
      case "hamstring_bridge":
      case "hamstring_slider":
      case "calf_raise":
      case "leg_swing":
        return (
          <g>
            {visualKey === "calf_raise" ? (
              <>
                <line x1="40" y1="130" x2="160" y2="130" stroke={fg} strokeWidth="2" />
                <path d="M96,38 L96,110 L118,128" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
                <circle cx="96" cy="76" r="7" fill={warn} opacity="0.4" stroke={warn} strokeWidth="2" />
                <text x="100" y="24" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
                  Straight Knee • Flat Floor 3s Up / 3s Down
                </text>
              </>
            ) : (
              <>
                <rect x="128" y="88" width="42" height="40" rx="3" fill={warn} opacity="0.3" stroke={warn} strokeWidth="2" />
                <path d="M36,124 L82,102 L144,88" fill="none" stroke={accent} strokeWidth="4.5" strokeLinecap="round" />
                <line x1="25" y1="128" x2="175" y2="128" stroke={fg} strokeWidth="2" />
                <text x="100" y="24" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
                  {visualKey === "hamstring_slider"
                    ? "5s Slow Eccentric Slide Out"
                    : visualKey === "leg_swing"
                    ? "Dynamic Posterior-Chain Primer"
                    : "35° Heel-Hook Bridge • 45s Analgesic Hold"}
                </text>
              </>
            )}
          </g>
        );
      default:
        return (
          <g>
            <line x1="100" y1="36" x2="100" y2="126" stroke={fg} strokeWidth="3" strokeDasharray="4 3" />
            <circle cx="100" cy="54" r="10" fill="none" stroke={accent} strokeWidth="3" />
            <path d="M68,78 L100,72 L132,78" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />
            <path d="M76,120 L100,98 L124,120" fill="none" stroke={fg} strokeWidth="3.5" strokeLinecap="round" />
            <text x="100" y="24" textAnchor="middle" fill={accent} fontSize="10" fontWeight="700">
              Controlled Posture &amp; Joint Mobility
            </text>
          </g>
        );
    }
  };

  return (
    <svg viewBox="0 0 200 155" className="w-full h-36 rounded-xl border border-slate-800/80" style={{ background: bg }}>
      {renderShape()}
    </svg>
  );
}

window.RehabCoachDashboard = function RehabCoachDashboard({
  activeSubTab = "triage",
  setActiveSubTab,
  isDark = true,
  ChartCanvas,
  showToast,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedInjuryId, setSelectedInjuryId] = useState("");
  const [checkinInjuryId, setCheckinInjuryId] = useState("");
  const [checkinDraft, setCheckinDraft] = useState({
    pain_rest: 1,
    pain_load: 3,
    morning_stiffness: 2,
    swelling: 0,
    warmup_minutes: 10,
    climbed_today: false,
    session_rpe: 5,
    notes: "",
  });
  const [savingCheckin, setSavingCheckin] = useState(false);

  // Add New Injury modal/panel
  const [showAddInjury, setShowAddInjury] = useState(false);
  const [newInjury, setNewInjury] = useState({
    title: "",
    body_region: "fingers",
    side: "bilateral",
    suspected_grade: "Grade 1",
    phase: "subacute",
    symptoms: "",
    mechanism: "",
    climbing_modifications: "",
  });

  // Editable clinical notes draft in Protocols tab
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Guided Workout Timer State
  const [activeProtocolId, setActiveProtocolId] = useState("adaptive_today");
  const [stepIdx, setStepIdx] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [timerPhase, setTimerPhase] = useState("idle"); // "idle" | "ready" | "work" | "switch" | "work_right" | "rest" | "done"
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sessionElapsedSec, setSessionElapsedSec] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(() => new Set());
  const [postPain, setPostPain] = useState(2);
  const [sessionNotes, setSessionNotes] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  // Assessment inputs map by test_id
  const [assessInputs, setAssessInputs] = useState({});
  const [savingTestId, setSavingTestId] = useState("");

  const audioCtxRef = useRef(null);

  const playChime = (kind = "tick") => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "done" ? 880 : kind === "switch" ? 660 : kind === "rest" ? 440 : 587;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (kind === "done" ? 0.35 : 0.16));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (kind === "done" ? 0.36 : 0.18));
    } catch (e) {}
  };

  const fetchRehab = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rehab");
      const json = await res.json();
      setData(json);
      const activeList = (json.injuries || []).filter((i) => i.status === "active");
      const firstId = activeList[0]?.id || json.injuries?.[0]?.id || "";
      if (!selectedInjuryId && firstId) setSelectedInjuryId(firstId);
    } catch (e) {
      if (showToast) showToast("Failed to load Rehab & PT Coach", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRehab();
  }, []);

  const injuries = data?.injuries || [];
  const activeInjury = injuries.find((i) => i.id === selectedInjuryId) || injuries[0] || null;

  useEffect(() => {
    if (activeInjury) {
      setNotesDraft(activeInjury.notes || "");
    }
  }, [activeInjury?.id, activeInjury?.notes]);

  const protocols = data?.protocols || [];
  const activeProtocol = protocols.find((p) => p.id === activeProtocolId) || data?.today_workout || protocols[0] || null;
  const exercises = activeProtocol?.exercises || [];
  const currentExercise = exercises[stepIdx] || exercises[0] || null;

  // Reset timer cleanly when switching protocol
  const selectProtocol = (pid) => {
    setTimerRunning(false);
    setActiveProtocolId(pid);
    setStepIdx(0);
    setCurrentSet(1);
    setTimerPhase("idle");
    setSecondsLeft(0);
    setSessionElapsedSec(0);
    setCompletedSteps(new Set());
  };

  // Interval Timer State Machine
  useEffect(() => {
    if (!timerRunning || !currentExercise) return;
    const id = setInterval(() => {
      setSessionElapsedSec((prev) => prev + 1);
      setSecondsLeft((prev) => {
        if (prev > 1) return prev - 1;

        const setsTotal = Number(currentExercise.sets || 1);
        const workSec = Number(currentExercise.work_sec || 30);
        const restSec = Number(currentExercise.rest_sec || 20);
        const isPerSide = currentExercise.side_mode === "per_side";

        if (timerPhase === "ready") {
          playChime("work");
          setTimerPhase("work");
          return workSec;
        }
        if (timerPhase === "work") {
          if (isPerSide) {
            playChime("switch");
            setTimerPhase("switch");
            return 5;
          }
          if (currentSet < setsTotal) {
            playChime("rest");
            setTimerPhase("rest");
            return restSec;
          }
          setCompletedSteps((s) => new Set([...s, stepIdx]));
          if (stepIdx + 1 < exercises.length) {
            playChime("rest");
            setTimerPhase("rest");
            return restSec;
          }
          playChime("done");
          setTimerPhase("done");
          setTimerRunning(false);
          return 0;
        }
        if (timerPhase === "switch") {
          playChime("work");
          setTimerPhase("work_right");
          return workSec;
        }
        if (timerPhase === "work_right") {
          if (currentSet < setsTotal) {
            playChime("rest");
            setTimerPhase("rest");
            return restSec;
          }
          setCompletedSteps((s) => new Set([...s, stepIdx]));
          if (stepIdx + 1 < exercises.length) {
            playChime("rest");
            setTimerPhase("rest");
            return restSec;
          }
          playChime("done");
          setTimerPhase("done");
          setTimerRunning(false);
          return 0;
        }
        if (timerPhase === "rest") {
          if (currentSet < setsTotal) {
            setCurrentSet((c) => c + 1);
            playChime("work");
            setTimerPhase("work");
            return workSec;
          }
          if (stepIdx + 1 < exercises.length) {
            const nextEx = exercises[stepIdx + 1];
            setStepIdx((idx) => idx + 1);
            setCurrentSet(1);
            playChime("work");
            setTimerPhase("work");
            return Number(nextEx?.work_sec || 30);
          }
        }
        setTimerRunning(false);
        setTimerPhase("done");
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerPhase, currentSet, stepIdx, currentExercise, exercises.length]);

  const startOrToggleTimer = () => {
    if (!currentExercise) return;
    if (timerPhase === "idle" || timerPhase === "done") {
      if (timerPhase === "done") {
        setStepIdx(0);
        setCurrentSet(1);
        setCompletedSteps(new Set());
        setSessionElapsedSec(0);
      }
      setTimerPhase("ready");
      setSecondsLeft(5);
      setTimerRunning(true);
      playChime("tick");
    } else {
      setTimerRunning((r) => !r);
    }
  };

  const jumpToExercise = (idx) => {
    const ex = exercises[idx];
    if (!ex) return;
    setTimerRunning(false);
    setStepIdx(idx);
    setCurrentSet(1);
    setTimerPhase("idle");
    setSecondsLeft(Number(ex.work_sec || 30));
  };

  const openCheckinForm = (inj) => {
    const lg = inj.latest_log || {};
    setCheckinInjuryId(inj.id);
    setCheckinDraft({
      pain_rest: lg.pain_rest ?? inj.triage?.pain_rest ?? 0,
      pain_load: lg.pain_load ?? inj.triage?.pain_load ?? 2,
      morning_stiffness: lg.morning_stiffness ?? inj.triage?.morning_stiffness ?? 2,
      swelling: lg.swelling ?? inj.triage?.swelling ?? 0,
      warmup_minutes: lg.warmup_minutes ?? 10,
      climbed_today: Boolean(lg.climbed_today),
      session_rpe: lg.session_rpe ?? 5,
      notes: "",
    });
  };

  const handleSaveCheckin = async (e) => {
    e.preventDefault();
    if (!checkinInjuryId) return;
    setSavingCheckin(true);
    try {
      const res = await fetch("/api/rehab/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          injury_id: checkinInjuryId,
          ...checkinDraft,
          climbed_today: checkinDraft.climbed_today ? 1 : 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      setCheckinInjuryId("");
      if (showToast) showToast("Daily check-in saved & readiness triage updated!");
    } catch (err) {
      if (showToast) showToast(err.message || "Could not save check-in", "error");
    } finally {
      setSavingCheckin(false);
    }
  };

  const handleAddInjury = async (e) => {
    e.preventDefault();
    if (!newInjury.title.trim()) return;
    try {
      const res = await fetch("/api/rehab/injuries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInjury),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      setShowAddInjury(false);
      setNewInjury({
        title: "",
        body_region: "fingers",
        side: "bilateral",
        suspected_grade: "Grade 1",
        phase: "subacute",
        symptoms: "",
        mechanism: "",
        climbing_modifications: "",
      });
      if (showToast) showToast("Added injury record to your body history!");
    } catch (err) {
      if (showToast) showToast(err.message || "Failed to add injury", "error");
    }
  };

  const handleUpdateInjuryField = async (inj, patch) => {
    setSavingNotes(true);
    try {
      const res = await fetch("/api/rehab/injuries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inj.id, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      if (showToast) showToast("Updated injury protocol & history notes!");
    } catch (err) {
      if (showToast) showToast(err.message || "Update failed", "error");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSaveSession = async () => {
    if (!activeProtocol) return;
    setSavingSession(true);
    try {
      const res = await fetch("/api/rehab/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol_id: activeProtocol.id,
          protocol_title: activeProtocol.title,
          duration_sec: Math.max(sessionElapsedSec, 60),
          exercises_completed: Math.max(completedSteps.size, stepIdx + 1),
          total_exercises: exercises.length,
          post_pain: Number(postPain || 0),
          notes: sessionNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      setSessionNotes("");
      if (showToast) showToast("Workout session saved to your PT Coach log!");
    } catch (err) {
      if (showToast) showToast(err.message || "Failed to log session", "error");
    } finally {
      setSavingSession(false);
    }
  };

  const handleSaveAssessment = async (testDef) => {
    const vals = assessInputs[testDef.id] || {};
    setSavingTestId(testDef.id);
    try {
      const res = await fetch("/api/rehab/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          test_id: testDef.id,
          left_val: vals.left_val ?? testDef.latest?.left_val ?? "",
          right_val: vals.right_val ?? testDef.latest?.right_val ?? "",
          notes: vals.notes ?? "",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      if (showToast) showToast(`Saved ${testDef.name} screen & recalculated asymmetries!`);
    } catch (err) {
      if (showToast) showToast(err.message || "Could not save assessment", "error");
    } finally {
      setSavingTestId("");
    }
  };

  const handleCopyBodyBrief = async () => {
    if (!data) return;
    const lines = [
      "# Climbing Rehab & Body Diagnostics Brief",
      `Readiness: ${data.overall_readiness?.label} (${data.overall_readiness?.active_count} active issues)`,
      `Anatomy: ${data.athlete_profile?.anatomy_summary || ""}`,
      "",
      "## Active Injuries",
      ...injuries.map(
        (i) =>
          `- **${i.title}** [${i.triage?.status_color?.toUpperCase()} | ${i.suspected_grade} | Phase: ${i.phase}] — Load Pain ${i.triage?.pain_load}/10, Morning Stiff ${i.triage?.morning_stiffness}/10. Mod: ${i.climbing_modifications}`
      ),
      "",
      "## Priority Mobility & Strength Gaps",
      ...(data.assessments?.priority_gaps || []).map(
        (g) => `- ${g.name}: ${g.status_label} (Asym ${g.asymmetry_pct ?? "—"}%, weak side: ${g.weak_side || "—"})`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      if (showToast) showToast("Copied full body & injury brief to clipboard!");
    } catch (e) {
      if (showToast) showToast("Clipboard copy unavailable", "error");
    }
  };

  if (loading || !data) {
    return (
      <div className="card-panel rounded-2xl p-10 text-center space-y-3">
        <div className="text-2xl animate-pulse">🧗 🩺 ⏱️</div>
        <div className="text-sm font-bold text-white">
          Loading Climbing Rehab Coach, Daily Injury Triage &amp; Body Diagnostics...
        </div>
      </div>
    );
  }

  const readiness = data.overall_readiness || {};
  const athlete = data.athlete_profile || {};
  const assessments = data.assessments || {};
  const triageBadgeCls = (col) =>
    col === "red"
      ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
      : col === "amber"
      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
      : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

  const phaseTotalSec =
    timerPhase === "work" || timerPhase === "work_right"
      ? Number(currentExercise?.work_sec || 30)
      : timerPhase === "rest"
      ? Number(currentExercise?.rest_sec || 20)
      : 5;
  const ringPct = phaseTotalSec > 0 ? Math.max(0, Math.min(1, secondsLeft / phaseTotalSec)) : 0;

  return (
    <div className="space-y-6">
      {/* Clinical Disclaimer & Readiness Banner */}
      <div className="card-panel rounded-2xl p-5 border border-amber-500/35 bg-gradient-to-r from-amber-950/35 via-slate-900 to-rose-950/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge border font-mono ${triageBadgeCls(readiness.status_color)}`}>
                {readiness.status_color === "red" ? "🔴" : readiness.status_color === "amber" ? "🟡" : "🟢"}{" "}
                {readiness.label}
              </span>
              <span className="badge bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
                {readiness.active_count || 0} Active Issues ({readiness.red_count || 0} Red · {readiness.amber_count || 0} Amber · {readiness.green_count || 0} Green)
              </span>
              <span className="badge bg-slate-800/80 text-slate-300 border border-slate-700 font-mono">
                {athlete.session_frequency || "Climbing PT"}
              </span>
            </div>
            <h1 className="text-xl font-extrabold text-white">
              🧗 Climbing Injury Rehab Coach, Guided PT Timers &amp; Body Diagnostics
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Anatomy Profile:</strong> {athlete.anatomy_summary} {athlete.long_warmup_notes}
            </p>
            <p className="text-[11px] text-slate-400">
              ℹ️ {data.clinical_disclaimer}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                selectProtocol("adaptive_today");
                setActiveSubTab && setActiveSubTab("workout");
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow cursor-pointer transition whitespace-nowrap"
            >
              ⏱️ Start Today&apos;s Guided PT ({data.today_workout?.est_minutes || 12}m) →
            </button>
            <button
              onClick={() => {
                selectProtocol("pre_climb_warmup");
                setActiveSubTab && setActiveSubTab("workout");
              }}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition whitespace-nowrap"
            >
              🔥 10-Min Pre-Climb Primer
            </button>
          </div>
        </div>
      </div>

      {/* ==================== SUB-TAB 1: TRIAGE & BODY MAP ==================== */}
      {activeSubTab === "triage" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 Cols: Interactive SVG Body Map + Today's Climbing Wall Rules */}
            <div className="lg:col-span-5 space-y-5">
              <div className="card-panel rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                      Interactive Climbing Body Map
                    </h2>
                    <p className="text-[11px] text-slate-400">Click any hotspot pin to focus its check-in &amp; modifications</p>
                  </div>
                </div>
                <RehabBodyMapSVG
                  injuries={injuries}
                  selectedInjuryId={selectedInjuryId}
                  onSelectInjury={(id) => setSelectedInjuryId(id)}
                  isDark={isDark}
                />
              </div>

              <div className="card-panel rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400">
                  🧱 Today&apos;s Climbing Wall Rules (Do&apos;s &amp; Don&apos;ts)
                </h2>
                <div className="space-y-2.5">
                  {(data.climbing_wall_rules || []).map((wr) => (
                    <div
                      key={wr.injury_id}
                      onClick={() => setSelectedInjuryId(wr.injury_id)}
                      className="p-3 rounded-xl bg-slate-950/65 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{wr.title}</span>
                        <span className={`badge border uppercase text-[10px] ${triageBadgeCls(wr.status_color)}`}>
                          {wr.status_color}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{wr.rule}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Active Injury Cards & 1-Click Daily Check-In */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  Active Injuries &amp; Daily Status Monitor ({injuries.length})
                </h2>
                <button
                  onClick={() => setShowAddInjury(!showAddInjury)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition"
                >
                  {showAddInjury ? "Close Form" : "+ Log New Injury / Nick"}
                </button>
              </div>

              {showAddInjury && (
                <form onSubmit={handleAddInjury} className="card-panel rounded-2xl p-5 border border-indigo-500/40 space-y-3">
                  <div className="text-sm font-bold text-white">Add New Injury or Watch Area</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <input
                      type="text"
                      required
                      placeholder="Injury Title (e.g., Left Ring Finger A2 Soreness)"
                      value={newInjury.title}
                      onChange={(e) => setNewInjury({ ...newInjury, title: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    />
                    <select
                      value={newInjury.body_region}
                      onChange={(e) => setNewInjury({ ...newInjury, body_region: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="fingers">Fingers &amp; Pulleys</option>
                      <option value="toe_foot">Toe &amp; Foot</option>
                      <option value="knee">Knee (LCL / Joint)</option>
                      <option value="calf_achilles">Upper Calf / Achilles</option>
                      <option value="hamstring">Hamstring / Posterior Chain</option>
                    </select>
                    <select
                      value={newInjury.side}
                      onChange={(e) => setNewInjury({ ...newInjury, side: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="left">Left Side</option>
                      <option value="right">Right Side</option>
                      <option value="bilateral">Bilateral (Both Sides)</option>
                    </select>
                    <select
                      value={newInjury.phase}
                      onChange={(e) => setNewInjury({ ...newInjury, phase: e.target.value })}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white"
                    >
                      <option value="acute">Phase 1: Acute / Fresh</option>
                      <option value="subacute">Phase 2: Sub-Acute</option>
                      <option value="strengthening">Phase 3: Strengthening</option>
                      <option value="return_to_sport">Phase 4: Return to Sport</option>
                    </select>
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Symptoms & what triggers it..."
                    value={newInjury.symptoms}
                    onChange={(e) => setNewInjury({ ...newInjury, symptoms: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                  <div className="flex justify-end">
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer">
                      Save Injury Record
                    </button>
                  </div>
                </form>
              )}

              {injuries.map((inj) => {
                const tri = inj.triage || {};
                const isSelected = inj.id === selectedInjuryId;
                const isLogging = checkinInjuryId === inj.id;
                return (
                  <div
                    key={inj.id}
                    className={`card-panel rounded-2xl p-5 space-y-3 transition ${
                      isSelected ? "ring-2 ring-indigo-500/70 border-indigo-500/60" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`badge border font-mono uppercase ${triageBadgeCls(tri.status_color)}`}>
                            {tri.readiness_label}
                          </span>
                          <span className="badge bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                            {inj.suspected_grade}
                          </span>
                          <span className="badge bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono uppercase">
                            {inj.phase}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white">{inj.title}</h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => (isLogging ? setCheckinInjuryId("") : openCheckinForm(inj))}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition"
                        >
                          {isLogging ? "Cancel" : "📝 Log Today's Check-In"}
                        </button>
                        <button
                          onClick={() => {
                            selectProtocol(inj.protocol_id || "adaptive_today");
                            setActiveSubTab && setActiveSubTab("workout");
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-emerald-500 text-emerald-400 text-xs font-bold cursor-pointer transition"
                        >
                          ⏱️ Rehab Drill
                        </button>
                      </div>
                    </div>

                    {/* Vitals Strip */}
                    <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                      <div className="p-2 rounded-lg bg-slate-950/65 border border-slate-800">
                        <div className="text-slate-400">Rest Pain</div>
                        <div className="font-mono font-bold text-white text-sm">{tri.pain_rest}/10</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/65 border border-slate-800">
                        <div className="text-slate-400">Load Pain</div>
                        <div className="font-mono font-bold text-amber-300 text-sm">{tri.pain_load}/10</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/65 border border-slate-800">
                        <div className="text-slate-400">AM Stiff</div>
                        <div className="font-mono font-bold text-indigo-300 text-sm">{tri.morning_stiffness}/10</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950/65 border border-slate-800">
                        <div className="text-slate-400">Swelling</div>
                        <div className="font-mono font-bold text-slate-200 text-sm">{tri.swelling}/3</div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-200">Symptoms &amp; Mechanics:</strong> {inj.symptoms}{" "}
                      <span className="text-slate-400">{inj.anatomy_note}</span>
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-slate-800/70">
                      <span className="text-emerald-400 font-medium">✓ {tri.load_scale_note}</span>
                      <button
                        onClick={() => {
                          setSelectedInjuryId(inj.id);
                          setActiveSubTab && setActiveSubTab("protocols");
                        }}
                        className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                      >
                        4-Phase Roadmap &amp; Notes →
                      </button>
                    </div>

                    {/* Inline Quick Check-In Drawer */}
                    {isLogging && (
                      <form onSubmit={handleSaveCheckin} className="p-4 rounded-xl bg-slate-950/85 border border-indigo-500/45 space-y-3">
                        <div className="text-xs font-bold text-indigo-300 uppercase">
                          Daily Check-In for {inj.title}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <label className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-300">Pain at Rest</span>
                              <span className="font-mono font-bold text-white">{checkinDraft.pain_rest}/10</span>
                            </div>
                            <input
                              type="range" min="0" max="10"
                              value={checkinDraft.pain_rest}
                              onChange={(e) => setCheckinDraft({ ...checkinDraft, pain_rest: Number(e.target.value) })}
                              className="w-full"
                            />
                          </label>
                          <label className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-300">Pain Under Load / Climbing</span>
                              <span className="font-mono font-bold text-amber-300">{checkinDraft.pain_load}/10</span>
                            </div>
                            <input
                              type="range" min="0" max="10"
                              value={checkinDraft.pain_load}
                              onChange={(e) => setCheckinDraft({ ...checkinDraft, pain_load: Number(e.target.value) })}
                              className="w-full"
                            />
                          </label>
                          <label className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-300">Morning Stiffness</span>
                              <span className="font-mono font-bold text-indigo-300">{checkinDraft.morning_stiffness}/10</span>
                            </div>
                            <input
                              type="range" min="0" max="10"
                              value={checkinDraft.morning_stiffness}
                              onChange={(e) => setCheckinDraft({ ...checkinDraft, morning_stiffness: Number(e.target.value) })}
                              className="w-full"
                            />
                          </label>
                          <label className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-slate-300">Swelling / Puffiness (0–3)</span>
                              <span className="font-mono font-bold text-white">{checkinDraft.swelling}/3</span>
                            </div>
                            <input
                              type="range" min="0" max="3"
                              value={checkinDraft.swelling}
                              onChange={(e) => setCheckinDraft({ ...checkinDraft, swelling: Number(e.target.value) })}
                              className="w-full"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <label className="flex items-center gap-2 text-slate-300">
                            <input
                              type="checkbox"
                              checked={checkinDraft.climbed_today}
                              onChange={(e) => setCheckinDraft({ ...checkinDraft, climbed_today: e.target.checked })}
                            />
                            Climbed / Trained Today
                          </label>
                          <label className="flex items-center gap-2 text-slate-300">
                            Warm-up (min):
                            <input
                              type="number" min="0" max="60"
                              value={checkinDraft.warmup_minutes}
                              onChange={(e) => setCheckinDraft({ ...checkinDraft, warmup_minutes: Number(e.target.value) })}
                              className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                            />
                          </label>
                        </div>
                        <input
                          type="text"
                          placeholder="How did it respond? (e.g., heel hook warmed up after 10 min, ring finger felt fine open-hand)"
                          value={checkinDraft.notes}
                          onChange={(e) => setCheckinDraft({ ...checkinDraft, notes: e.target.value })}
                          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={savingCheckin}
                            className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                          >
                            {savingCheckin ? "Saving..." : "Save Check-In & Update Triage"}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 2: GUIDED WORKOUT & INTERVAL TIMER ==================== */}
      {activeSubTab === "workout" && (
        <div className="space-y-6">
          {/* Protocol Selector Strip */}
          <div className="card-panel rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Choose Guided Rehab or Warm-Up Sequence
              </span>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                  soundEnabled
                    ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                    : "bg-slate-900 border-slate-700 text-slate-400"
                }`}
              >
                {soundEnabled ? "🔔 Audio Chimes ON" : "🔕 Audio Muted"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {protocols.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectProtocol(p.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    activeProtocol?.id === p.id
                      ? "bg-emerald-600 text-white border-emerald-400 shadow"
                      : "bg-slate-900 text-slate-300 border-slate-800 hover:border-indigo-500/50"
                  }`}
                >
                  {p.title} ({p.est_minutes}m)
                </button>
              ))}
            </div>
            {activeProtocol && (
              <p className="text-xs text-slate-400">{activeProtocol.subtitle}</p>
            )}
          </div>

          {currentExercise && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 5 Cols: Interactive Timer Ring + Queue */}
              <div className="lg:col-span-5 space-y-5">
                <div className="card-panel rounded-2xl p-6 text-center space-y-4 border border-emerald-500/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-indigo-300">
                      Step {stepIdx + 1} of {exercises.length}
                    </span>
                    <span className="font-mono font-bold text-slate-300">
                      Set {currentSet} / {currentExercise.sets}
                    </span>
                  </div>

                  {/* Circular SVG Countdown Ring */}
                  <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                      <circle cx="60" cy="60" r="52" fill="none" stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth="8" />
                      <circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke={
                          timerPhase === "work" || timerPhase === "work_right"
                            ? "#10b981"
                            : timerPhase === "switch"
                            ? "#f59e0b"
                            : timerPhase === "rest"
                            ? "#6366f1"
                            : "#94a3b8"
                        }
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 52}
                        strokeDashoffset={(2 * Math.PI * 52) * (1 - ringPct)}
                        style={{ transition: "stroke-dashoffset 0.35s linear" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                        {timerPhase === "idle"
                          ? "READY"
                          : timerPhase === "ready"
                          ? "GET READY"
                          : timerPhase === "work"
                          ? currentExercise.side_mode === "per_side"
                            ? "WORK • LEFT"
                            : "WORK / HOLD"
                          : timerPhase === "switch"
                          ? "SWITCH SIDES"
                          : timerPhase === "work_right"
                          ? "WORK • RIGHT"
                          : timerPhase === "rest"
                          ? "REST"
                          : "COMPLETE!"}
                      </span>
                      <span className="text-4xl font-extrabold font-mono text-white">
                        {timerPhase === "idle" ? `${currentExercise.work_sec}s` : `${secondsLeft}s`}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Elapsed: {Math.floor(sessionElapsedSec / 60)}m {sessionElapsedSec % 60}s
                      </span>
                    </div>
                  </div>

                  {/* Timer Controls */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => jumpToExercise(Math.max(0, stepIdx - 1))}
                      disabled={stepIdx === 0}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 disabled:opacity-40 text-xs font-bold text-slate-300 cursor-pointer"
                    >
                      ⏮ Prev
                    </button>
                    <button
                      onClick={startOrToggleTimer}
                      className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow cursor-pointer"
                    >
                      {timerRunning ? "⏸ Pause" : timerPhase === "idle" || timerPhase === "done" ? "▶ Start Timer" : "▶ Resume"}
                    </button>
                    <button
                      onClick={() => jumpToExercise(stepIdx)}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
                    >
                      ↺ Reset
                    </button>
                    <button
                      onClick={() => {
                        setCompletedSteps((s) => new Set([...s, stepIdx]));
                        if (stepIdx + 1 < exercises.length) jumpToExercise(stepIdx + 1);
                      }}
                      disabled={stepIdx + 1 >= exercises.length}
                      className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 disabled:opacity-40 text-xs font-bold text-slate-300 cursor-pointer"
                    >
                      Next ⏭
                    </button>
                  </div>
                </div>

                {/* Sequence Queue & Save Session */}
                <div className="card-panel rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Session Steps ({exercises.length})
                  </div>
                  <div className="space-y-1.5">
                    {exercises.map((ex, idx) => (
                      <button
                        key={`${ex.id}-${idx}`}
                        onClick={() => jumpToExercise(idx)}
                        className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                          idx === stepIdx
                            ? "bg-indigo-600/20 border-indigo-500 text-white font-bold"
                            : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        <span className="truncate">
                          {completedSteps.has(idx) ? "✓ " : `${idx + 1}. `}
                          {ex.name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          {ex.sets}×{ex.work_sec}s{ex.side_mode === "per_side" ? "/side" : ""}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Save Completed Workout Session */}
                  <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs">
                    <div className="font-bold text-white">Complete &amp; Log Rehab Session</div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-400">Post-Session Pain (0–10):</span>
                      <input
                        type="number" min="0" max="10"
                        value={postPain}
                        onChange={(e) => setPostPain(Number(e.target.value))}
                        className="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Session notes (how tissues felt)..."
                      value={sessionNotes}
                      onChange={(e) => setSessionNotes(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                    />
                    <button
                      onClick={handleSaveSession}
                      disabled={savingSession}
                      className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                    >
                      {savingSession ? "Saving..." : "💾 Save Completed Session to Coach History"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 7 Cols: Visual Form Diagram, Cues & Video Link */}
              <div className="lg:col-span-7 space-y-5">
                <div className="card-panel rounded-2xl p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-mono">
                          {currentExercise.target_tissues}
                        </span>
                        <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                          Pain Ceiling: {currentExercise.pain_ceiling}
                        </span>
                      </div>
                      <h2 className="text-xl font-extrabold text-white mt-2">{currentExercise.name}</h2>
                      {currentExercise.linked_injury && (
                        <div className="text-xs text-emerald-400 font-semibold mt-0.5">
                          Targeted for: {currentExercise.linked_injury}
                        </div>
                      )}
                    </div>

                    <a
                      href={currentExercise.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 text-xs font-bold whitespace-nowrap transition"
                    >
                      ▶ Watch PT Demo Video ↗
                    </a>
                  </div>

                  {/* Inline SVG Exercise Diagram */}
                  <ExerciseVisualDiagram
                    visualKey={currentExercise.visual_key}
                    isDark={isDark}
                    isWorking={timerPhase === "work" || timerPhase === "work_right"}
                  />

                  <div className="grid grid-cols-3 gap-3 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/65 border border-slate-800">
                      <div className="text-slate-400">Prescription</div>
                      <div className="font-mono font-bold text-white mt-0.5">{currentExercise.reps_label}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950/65 border border-slate-800">
                      <div className="text-slate-400">Tempo</div>
                      <div className="font-mono font-bold text-indigo-300 mt-0.5">{currentExercise.tempo}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950/65 border border-slate-800">
                      <div className="text-slate-400">Rest Between Sets</div>
                      <div className="font-mono font-bold text-emerald-300 mt-0.5">{currentExercise.rest_sec}s</div>
                    </div>
                  </div>

                  {currentExercise.coaching_note && (
                    <div className="p-3 rounded-xl bg-rose-950/35 border border-rose-500/40 text-xs text-rose-200 font-semibold">
                      ⚠️ {currentExercise.coaching_note}
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Exact Execution Form Cues
                    </h3>
                    <ul className="space-y-1.5 text-xs text-slate-200">
                      {(currentExercise.cues || []).map((cue, cIdx) => (
                        <li key={cIdx} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{cue}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 text-xs text-amber-200">
                    <strong>🚫 Key Mistake to Avoid:</strong> {currentExercise.avoid}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== SUB-TAB 3: PROTOCOLS & PAIN HISTORY ==================== */}
      {activeSubTab === "protocols" && activeInjury && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {injuries.map((inj) => (
              <button
                key={inj.id}
                onClick={() => setSelectedInjuryId(inj.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  inj.id === activeInjury.id
                    ? "bg-indigo-600 text-white border-indigo-400 shadow"
                    : "bg-slate-900 text-slate-300 border-slate-800 hover:border-indigo-500/50"
                }`}
              >
                {inj.title}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 4-Phase Clinical Progression Roadmap */}
            <div className="lg:col-span-6 card-panel rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-300">
                  4-Phase Clinical Rehab Roadmap
                </h2>
                <select
                  value={activeInjury.phase}
                  onChange={(e) => handleUpdateInjuryField(activeInjury, { phase: e.target.value })}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white"
                >
                  <option value="acute">Phase 1: Acute</option>
                  <option value="subacute">Phase 2: Sub-Acute</option>
                  <option value="strengthening">Phase 3: Strengthening</option>
                  <option value="return_to_sport">Phase 4: Return to Sport</option>
                </select>
              </div>

              <div className="space-y-2.5">
                {(activeInjury.roadmap || []).map((rm) => {
                  const isCurr = rm.phase === activeInjury.phase;
                  return (
                    <div
                      key={rm.phase}
                      onClick={() => handleUpdateInjuryField(activeInjury, { phase: rm.phase })}
                      className={`p-3.5 rounded-xl border cursor-pointer transition ${
                        isCurr
                          ? "bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/40"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{rm.label}</span>
                        {isCurr && <span className="badge bg-indigo-500/25 text-indigo-300 font-mono">ACTIVE PHASE</span>}
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{rm.goal}</p>
                    </div>
                  );
                })}
              </div>

              <div className="p-3.5 rounded-xl bg-rose-950/25 border border-rose-500/35 text-xs text-rose-200">
                <strong>🚩 Red-Flag Stop Criteria:</strong> {activeInjury.red_flags}
              </div>
            </div>

            {/* Pain History Chart & Longitudinal Clinical Notes */}
            <div className="lg:col-span-6 space-y-5">
              <div className="card-panel rounded-2xl p-5 space-y-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  Longitudinal Pain &amp; Morning Stiffness Trend
                </h2>
                {activeInjury.logs_history?.length > 0 ? (
                  <ChartCanvas
                    type="line"
                    height={200}
                    isDark={isDark}
                    data={{
                      labels: activeInjury.logs_history.map((l) => l.log_date),
                      datasets: [
                        {
                          label: "Load Pain (0–10)",
                          data: activeInjury.logs_history.map((l) => l.pain_load),
                          borderColor: "#f59e0b",
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          tension: 0.25,
                          fill: true,
                        },
                        {
                          label: "Morning Stiffness (0–10)",
                          data: activeInjury.logs_history.map((l) => l.morning_stiffness),
                          borderColor: "#6366f1",
                          backgroundColor: "transparent",
                          tension: 0.25,
                        },
                        {
                          label: "Rest Pain (0–10)",
                          data: activeInjury.logs_history.map((l) => l.pain_rest),
                          borderColor: "#f43f5e",
                          backgroundColor: "transparent",
                          borderDash: [4, 4],
                          tension: 0.25,
                        },
                      ],
                    }}
                    options={{
                      scales: {
                        y: { min: 0, max: 10, ticks: { color: isDark ? "#94a3b8" : "#475569", stepSize: 2 } },
                        x: { ticks: { color: isDark ? "#94a3b8" : "#475569" } },
                      },
                      plugins: {
                        legend: { position: "bottom", labels: { color: isDark ? "#cbd5e1" : "#334155", font: { size: 10 } } },
                      },
                    }}
                  />
                ) : (
                  <div className="text-xs text-slate-400 py-8 text-center">
                    Log a daily check-in in Triage &amp; Body Map to plot your trend.
                  </div>
                )}
              </div>

              <div className="card-panel rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                    Retained Clinical Notes &amp; External Context
                  </h2>
                  <select
                    value={activeInjury.status}
                    onChange={(e) => handleUpdateInjuryField(activeInjury, { status: e.target.value })}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-semibold text-white"
                  >
                    <option value="active">Status: Active</option>
                    <option value="monitoring">Status: Monitoring</option>
                    <option value="resolved">Status: Resolved</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-400">
                  Save mechanism details, PT feedback, or paste prior chat notes (e.g., big toe history) so your body ledger stays complete.
                </p>
                <textarea
                  rows={4}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => handleUpdateInjuryField(activeInjury, { notes: notesDraft })}
                    disabled={savingNotes}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                  >
                    {savingNotes ? "Saving..." : "Save Clinical Notes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 4: MOBILITY & BODY SCREEN ==================== */}
      {activeSubTab === "mobility" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card-panel rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Body Screen Completion</div>
              <div className="text-2xl font-extrabold font-mono text-white mt-1">
                {assessments.tested_count || 0} / {assessments.total_tests || 8} Tests
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Evaluate L/R flexibility, strength &amp; posture</div>
            </div>
            <div className="card-panel rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Largest L/R Asymmetry</div>
              <div className="text-2xl font-extrabold font-mono text-amber-300 mt-1">
                {assessments.max_asymmetry_pct || 0}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Target {"< 10%"} side-to-side gap</div>
            </div>
            <div className="card-panel rounded-2xl p-4">
              <div className="text-[11px] font-bold uppercase text-slate-400">Priority Weak Links</div>
              <div className="text-2xl font-extrabold font-mono text-rose-400 mt-1">
                {(assessments.priority_gaps || []).length} Flagged
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Linked directly to corrective drills</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {(assessments.catalog || []).map((test) => {
              const ev = test.evaluation || {};
              const latest = test.latest || {};
              const inp = assessInputs[test.id] || {};
              const badgeCls =
                ev.status === "priority_gap"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : ev.status === "watch"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : ev.status === "optimal"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-800 text-slate-300 border-slate-700";

              return (
                <div key={test.id} className="card-panel rounded-2xl p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-indigo-400">{test.region}</span>
                      <h3 className="text-sm font-bold text-white">{test.name}</h3>
                    </div>
                    <span className={`badge border font-mono ${badgeCls}`}>{ev.status_label}</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{test.how_to}</p>
                  <p className="text-[11px] text-slate-400">
                    <strong>Why it matters:</strong> {test.why_climber} · Target: <span className="font-mono text-emerald-400">{test.target_label}</span>
                  </p>

                  <div className="grid grid-cols-3 gap-2 items-end text-xs">
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400">Left ({test.unit})</span>
                      <input
                        type="number" step="0.5"
                        placeholder={latest.left_val != null ? String(latest.left_val) : "L"}
                        value={inp.left_val ?? (latest.left_val != null ? String(latest.left_val) : "")}
                        onChange={(e) =>
                          setAssessInputs({ ...assessInputs, [test.id]: { ...inp, left_val: e.target.value } })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[11px] text-slate-400">Right ({test.unit})</span>
                      <input
                        type="number" step="0.5"
                        placeholder={latest.right_val != null ? String(latest.right_val) : "R"}
                        value={inp.right_val ?? (latest.right_val != null ? String(latest.right_val) : "")}
                        onChange={(e) =>
                          setAssessInputs({ ...assessInputs, [test.id]: { ...inp, right_val: e.target.value } })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono"
                      />
                    </label>
                    <button
                      onClick={() => handleSaveAssessment(test)}
                      disabled={savingTestId === test.id}
                      className="py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                    >
                      {savingTestId === test.id ? "Saving..." : "Save Score"}
                    </button>
                  </div>

                  {ev.asymmetry_pct != null && (
                    <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-mono">
                        Asymmetry: <strong>{ev.asymmetry_pct}%</strong>{" "}
                        {ev.weak_side && ev.weak_side !== "balanced" ? `(Weak/Stiff side: ${ev.weak_side.toUpperCase()})` : "(Balanced)"}
                      </span>
                      <button
                        onClick={() => {
                          selectProtocol("posture_mobility_flow");
                          setActiveSubTab && setActiveSubTab("workout");
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                      >
                        Run Mobility Flow →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 5: COACH LOG & BODY TIMELINE ==================== */}
      {activeSubTab === "history" && (
        <div className="space-y-5">
          <div className="card-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Longitudinal Body, Rehab &amp; Check-In Ledger</h2>
              <p className="text-xs text-slate-400">
                Retains every workout timer session, daily pain check-in, and mobility screen over time.
              </p>
            </div>
            <button
              onClick={handleCopyBodyBrief}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              📋 Copy Full Body &amp; Injury Brief
            </button>
          </div>

          <div className="card-panel rounded-2xl p-5 space-y-2.5">
            {(data.timeline || []).length === 0 ? (
              <div className="text-xs text-slate-400 py-8 text-center">
                No sessions or check-ins recorded yet.
              </div>
            ) : (
              (data.timeline || []).map((ev, idx) => (
                <div
                  key={`${ev.kind}-${ev.date}-${idx}`}
                  className="p-3 rounded-xl bg-slate-950/65 border border-slate-800 flex flex-wrap items-start justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-400">{ev.date}</span>
                      <span className="font-bold text-white">{ev.title}</span>
                    </div>
                    <div className="text-indigo-300 font-mono text-[11px]">{ev.detail}</div>
                    {ev.notes && <div className="text-slate-400 text-[11px]">{ev.notes}</div>}
                  </div>
                  <span className="badge bg-slate-800 text-slate-300 uppercase text-[10px] font-mono">
                    {ev.kind}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

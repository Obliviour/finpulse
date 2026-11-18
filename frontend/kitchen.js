const { useState, useEffect, useMemo } = React;

window.NutritionKitchenDashboard = function NutritionKitchenDashboard({
  activeSubTab = "labs",
  setActiveSubTab,
  isDark = true,
  ChartCanvas,
  fmtCurrency,
  fmtCompact,
  showToast,
  onSwitchToFinance,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mealFilter, setMealFilter] = useState("All");
  const [maxPrepFilter, setMaxPrepFilter] = useState(99);
  const [selectedMealId, setSelectedMealId] = useState("");
  const [storeFilter, setStoreFilter] = useState("All");

  const fetchNutrition = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nutrition");
      const json = await res.json();
      setData(json);
    } catch (e) {
      if (showToast) showToast("Failed to load Nutrition & Blood Labs data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNutrition();
  }, []);

  const updateInputs = async (patch, save = true) => {
    if (!data) return;
    const nextInputs = { ...(data.inputs || {}), ...patch };
    try {
      const endpoint = save ? "/api/nutrition" : "/api/nutrition/preview";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextInputs),
      });
      const json = await res.json();
      if (!json.error) {
        setData(json);
      }
    } catch (e) {
      if (showToast) showToast("Failed to update calculation", "error");
    }
  };

  const toggleGroceryItem = async (itemName, clearAll = false) => {
    try {
      const res = await fetch("/api/nutrition/grocery-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: itemName, clear_all: clearAll }),
      });
      const json = await res.json();
      if (json.checked_groceries && data) {
        setData({ ...data, checked_groceries: json.checked_groceries });
      }
    } catch (e) {
      if (showToast) showToast("Could not update grocery checklist", "error");
    }
  };

  if (loading || !data) {
    return (
      <div className="card-panel rounded-2xl p-10 text-center space-y-3">
        <div className="text-2xl animate-pulse">🥗 🧬 🧗</div>
        <div className="text-sm font-bold text-white">Loading Sister Dashboard: Clinical Blood Labs (2020–2026), Air Fryer System & Uber Eats ROI...</div>
      </div>
    );
  }

  const inputs = data.inputs || {};
  const uiCopy = data.ui_copy || {};
  const vitals = data.vitals_and_targets || {};
  const labs = data.labs || {};
  const ldlSim = labs.ldl_simulation || {};
  const vitD = labs.vitamin_d_protocol || {};
  const econ = data.food_economics || {};
  const roiSim = econ.roi_simulation || {};
  const meals = data.air_fryer_meals || [];
  const prepSystem = data.modular_prep_system || {};
  const breakfast = data.breakfast_protocol || {};
  const workplaceCafe = data.workplace_cafe_playbook || {};
  const nightSnacks = data.night_snack_matrix || {};
  const groceryStores = data.grocery_store_matrix || [];
  const checkedSet = new Set(data.checked_groceries || []);

  const filteredMeals = meals.filter((m) => {
    if (mealFilter !== "All" && m.category !== mealFilter) return false;
    if (m.active_prep_min > maxPrepFilter) return false;
    return true;
  });

  const activeMeal = meals.find((m) => m.id === selectedMealId) || filteredMeals[0] || meals[0];
  const mealCategories = ["All", ...Array.from(new Set(meals.map((m) => m.category).filter(Boolean)))];
  const storeTabs = ["All", ...groceryStores.map((g) => (g.store || "").split(" (")[0]).filter(Boolean)];

  // Build Longitudinal Lipid Chart Data dynamically from labs.history (last 3 recorded panels + projected target)
  const labHistWithLipids = (labs.history || []).filter((h) => h.metrics && h.metrics.ldl !== undefined);
  const recentLipidPanels = labHistWithLipids.slice(-3);
  const chartLabels = (uiCopy.lab_chart_labels && uiCopy.lab_chart_labels.length >= recentLipidPanels.length + 1)
    ? uiCopy.lab_chart_labels
    : [...recentLipidPanels.map((p) => p.label || p.date), "Projected (Diet Swaps)"];
  const ldlSeries = [...recentLipidPanels.map((p) => p.metrics.ldl), ldlSim.projected_ldl || 96];
  const nonHdlSeries = [...recentLipidPanels.map((p) => p.metrics.non_hdl), ldlSim.projected_non_hdl || 111];
  const lipidChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "LDL-C (mg/dL • Goal <100)",
        data: ldlSeries,
        borderColor: "#f43f5e",
        backgroundColor: "rgba(244, 63, 94, 0.16)",
        borderWidth: 3,
        pointRadius: 5,
        tension: 0.25,
        fill: true,
      },
      {
        label: "Non-HDL (mg/dL • Goal <130)",
        data: nonHdlSeries,
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.08)",
        borderWidth: 2.5,
        borderDash: [5, 4],
        pointRadius: 4,
        tension: 0.25,
      },
      {
        label: "Triglycerides (mg/dL • Goal <150)",
        data: [46, 47, 82, 48],
        borderColor: "#06b6d4",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.25,
      },
      {
        label: "HDL-C (mg/dL • Goal ≥40)",
        data: [55, 62, 49, 58],
        borderColor: "#10b981",
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 4,
        tension: 0.25,
      },
    ],
  };

  // Monthly Food Spend Chart (Delivery vs Dine-Out vs Groceries)
  const monthlySeries = econ.monthly_series || [];
  const foodSpendChartData = {
    labels: monthlySeries.map((m) => m.ym),
    datasets: [
      {
        label: "Uber Eats & DoorDash Delivery",
        data: monthlySeries.map((m) => m.delivery),
        backgroundColor: "#f43f5e",
        borderRadius: 4,
      },
      {
        label: "Restaurants & Dine-Out",
        data: monthlySeries.map((m) => m.dine_out),
        backgroundColor: "#f59e0b",
        borderRadius: 4,
      },
      {
        label: "Groceries (Costco / Met Market / WF)",
        data: monthlySeries.map((m) => m.groceries),
        backgroundColor: "#10b981",
        borderRadius: 4,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Sister Dashboard Hero Banner */}
      <div className="card-panel rounded-2xl p-5 border border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-slate-900 to-indigo-950/50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                🥗 SISTER PERSPECTIVE • FUEL, LABS &amp; KITCHEN ROI
              </span>
              <span className="badge bg-rose-500/20 text-rose-300 border border-rose-500/40">
                Latest LDL-C: {ldlSim.current_ldl} mg/dL → Target {ldlSim.projected_ldl} mg/dL
              </span>
              <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Vit D: {vitD.current_ng_ml ?? ldlSim.current_vit_d} ng/mL → Target {vitD.target_ng_ml ?? 50} ng/mL
              </span>
              <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                {vitals.height_display} • {vitals.weight_lbs} lbs (Target {vitals.target_weight_lbs} lbs) • {vitals.protein_g}g Protein/d
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              {uiCopy.banner_title || "High-Efficiency Kitchen, Labs & Delivery Arbitrage"}
            </h1>
            <p className="text-xs text-slate-300 max-w-4xl">
              {uiCopy.banner_subtitle || "Connect your clinical biomarkers, training macros, and home kitchen ROI against restaurant delivery spend."}{" "}
              Swap <strong className="text-rose-300">{fmtCurrency(econ.avg_delivery_order)} avg delivery orders</strong> for{" "}
              <strong className="text-emerald-300">rapid home trays ({fmtCurrency(roiSim.home_meal_cost_for_two)} for two)</strong>{" "}
              — saving <strong className="text-emerald-400">{fmtCurrency(roiSim.annual_cash_saved)}/yr</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {labs.folder_url && (
              <a
                href={labs.folder_url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-indigo-300 border border-slate-700 transition"
              >
                Open Lab PDFs Folder ↗
              </a>
            )}
            {onSwitchToFinance && (
              <button
                onClick={onSwitchToFinance}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow transition"
              >
                ← Back to Wealth &amp; Finance
              </button>
            )}
          </div>
        </div>

        {/* 5 KPI Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          <div
            onClick={() => setActiveSubTab("labs")}
            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-rose-500/50 cursor-pointer transition"
          >
            <div className="text-[10px] font-bold uppercase text-slate-400">LDL-C &amp; Non-HDL</div>
            <div className="text-lg font-extrabold font-mono text-rose-400 mt-0.5">
              {ldlSim.current_ldl} <span className="text-xs text-slate-400">→</span> <span className="text-emerald-400">{ldlSim.projected_ldl} mg/dL</span>
            </div>
            <div className="text-[11px] text-slate-400">Non-HDL: {ldlSim.current_non_hdl} → {ldlSim.projected_non_hdl} (-{ldlSim.total_reduction_pct}%)</div>
          </div>

          <div
            onClick={() => setActiveSubTab("labs")}
            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/50 cursor-pointer transition"
          >
            <div className="text-[10px] font-bold uppercase text-slate-400">Vitamin D &amp; HbA1c</div>
            <div className="text-lg font-extrabold font-mono text-amber-400 mt-0.5">
              {vitD.current_ng_ml ?? ldlSim.current_vit_d} ng/mL <span className="text-xs text-emerald-400">• A1c {(labs.latest?.metrics?.hba1c ?? 5.2)}%</span>
            </div>
            <div className="text-[11px] text-slate-400">{vitD.status || "Monitor seasonal D3 + salmon"}</div>
          </div>

          <div
            onClick={() => setActiveSubTab("macros")}
            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition"
          >
            <div className="text-[10px] font-bold uppercase text-slate-400">Training Daily Targets</div>
            <div className="text-lg font-extrabold font-mono text-cyan-300 mt-0.5">
              {vitals.active_target_kcal?.toLocaleString()} kcal <span className="text-xs text-emerald-300">• {vitals.protein_g}g Pro</span>
            </div>
            <div className="text-[11px] text-slate-400">Sat Fat ≤{vitals.sat_fat_cap_g}g • Sol Fiber ≥{vitals.soluble_fiber_target_g}g</div>
          </div>

          <div
            onClick={() => setActiveSubTab("meals")}
            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/50 cursor-pointer transition"
          >
            <div className="text-[10px] font-bold uppercase text-slate-400">Home Dinner Speed</div>
            <div className="text-lg font-extrabold font-mono text-indigo-300 mt-0.5">
              5m Prep <span className="text-xs text-slate-400">+</span> 9m Cook
            </div>
            <div className="text-[11px] text-slate-400">Parchment liner = 0 pan scrubbing</div>
          </div>

          <div
            onClick={() => setActiveSubTab("roi")}
            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-emerald-500/50 cursor-pointer transition"
          >
            <div className="text-[10px] font-bold uppercase text-slate-400">Delivery Swap Savings</div>
            <div className="text-lg font-extrabold font-mono text-emerald-400 mt-0.5">
              +{fmtCurrency(roiSim.annual_cash_saved)}/yr
            </div>
            <div className="text-[11px] text-slate-400">{fmtCompact(roiSim.compounded_savings || roiSim.fire_age_38_compounded)} 10-Yr Compounded</div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "labs", label: "1. Blood Labs & Lipid Protocol" },
            { id: "meals", label: "2. Air Fryer & Batch Prep" },
            { id: "macros", label: uiCopy.macro_subtab_label || "3. Training Macros, Cafe & Snacks" },
            { id: "groceries", label: "4. Weekly Grocery Routing" },
            { id: "roi", label: "5. Delivery vs. Home Kitchen ROI" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                activeSubTab === t.id
                  ? "bg-emerald-600 border-emerald-400 text-white shadow-md"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ==================== SUB-TAB 1: BLOOD LABS & LDL PROTOCOL ==================== */}
      {activeSubTab === "labs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Cols: Lipid Trajectory Chart + Clinical Insights */}
            <div className="lg:col-span-7 card-panel rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Longitudinal Lipid &amp; Metabolic Panel Trajectory
                  </h2>
                  <p className="text-xs text-slate-400">
                    {uiCopy.lab_subtab_subtitle || "LDL-C, Non-HDL Cholesterol, Triglycerides & HDL-C panel trend"}
                  </p>
                </div>
                <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  Goal: LDL &lt;100 • Non-HDL &lt;130
                </span>
              </div>

              {ChartCanvas && (
                <ChartCanvas
                  type="line"
                  height={270}
                  isDark={isDark}
                  data={lipidChartData}
                  options={{
                    plugins: {
                      legend: { position: "top", labels: { color: isDark ? "#cbd5e1" : "#334155", boxWidth: 12, font: { size: 11 } } },
                    },
                    scales: {
                      y: {
                        min: 30,
                        max: 180,
                        grid: { color: isDark ? "rgba(51,65,85,0.35)" : "rgba(203,213,225,0.6)" },
                        ticks: { color: isDark ? "#94a3b8" : "#475569" },
                      },
                      x: {
                        grid: { display: false },
                        ticks: { color: isDark ? "#cbd5e1" : "#334155", font: { weight: "600", size: 11 } },
                      },
                    },
                  }}
                />
              )}

              {/* 4 Clinical Takeaways from the 6 PDFs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {(labs.clinical_takeaways || []).map((c, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border space-y-1.5 ${
                      c.severity === "high"
                        ? "bg-rose-950/30 border-rose-800/50"
                        : c.severity === "positive"
                        ? "bg-emerald-950/30 border-emerald-800/50"
                        : "bg-amber-950/30 border-amber-800/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{c.title}</span>
                    </div>
                    <div>
                      <span
                        className={`badge font-mono ${
                          c.severity === "high"
                            ? "bg-rose-500/20 text-rose-300"
                            : c.severity === "positive"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {c.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: Interactive Portfolio Diet LDL Reduction Simulator */}
            <div className="lg:col-span-5 card-panel rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-white">Portfolio Diet LDL-C Simulator</h2>
                  <p className="text-xs text-slate-400">
                    {uiCopy.ldl_sim_subtitle || "Toggle evidence-based nutrition levers to preview projected biomarker shifts"}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Projected LDL-C</div>
                  <div className={`text-2xl font-extrabold font-mono ${ldlSim.projected_ldl < 100 ? "text-emerald-400" : "text-amber-400"}`}>
                    {ldlSim.projected_ldl} mg/dL
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    key: "lever_sat_fat_cap",
                    title: "1. Cap Saturated Fat < 13g/day (Dietary Cholesterol Clearance)",
                    desc: "Upregulates hepatic LDL receptors by swapping high-sat-fat restaurant & delivery sauces for lean fish, poultry & extra-virgin olive oil.",
                  },
                  {
                    key: "lever_soluble_fiber",
                    title: "2. Hit 12–14g/day Viscous Soluble Fiber",
                    desc: "Morning oat beta-glucan + psyllium + barley/legumes bind bile acids in the gut so cholesterol is excreted.",
                  },
                  {
                    key: "lever_soy_marine_swap",
                    title: "3. Soy Protein + Wild Salmon 3x/wk",
                    desc: "Tofu, edamame & unsweetened soy milk plus wild sockeye salmon (supports serum Vitamin D & lower triglycerides).",
                  },
                  {
                    key: "lever_nuts_sterols_evoo",
                    title: "4. Walnuts/Almonds (30g/d) + Avocado & EVOO",
                    desc: "Replaces saturated snack fats with polyunsaturated/monounsaturated fats and natural plant sterols.",
                  },
                ].map((lv) => {
                  const isOn = Boolean(inputs[lv.key]);
                  return (
                    <div
                      key={lv.key}
                      onClick={() => updateInputs({ [lv.key]: !isOn })}
                      className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                        isOn
                          ? "bg-emerald-950/35 border-emerald-600/50"
                          : "bg-slate-900/50 border-slate-800 opacity-60 hover:opacity-90"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => {}}
                        className="mt-1 h-4 w-4 rounded accent-emerald-500"
                      />
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white">{lv.title}</div>
                        <div className="text-[11px] text-slate-300 leading-relaxed">{lv.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Next Blood Draw Order Card */}
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-700/50 space-y-2 text-xs">
                <div className="font-bold text-indigo-200 flex items-center justify-between">
                  <span>Next Follow-Up Lab Panel Checklist (10–12 Weeks)</span>
                  <span className="badge bg-indigo-500/30 text-indigo-200">{uiCopy.vit_d_location_badge || "Primary Care Clinic"}</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                  <li>
                    <strong>ApoB (Apolipoprotein B)</strong>: Measures atherogenic particle count directly (optimal <strong className="text-emerald-300">&lt;80 mg/dL</strong>).
                  </li>
                  <li>
                    <strong>Lp(a) — Lipoprotein(a) [One-Time Genetic Screen]</strong>: Separates genetic LDL baseline from dietary response.
                  </li>
                  <li>
                    <strong>25-OH Vitamin D Re-Check</strong>: Confirm serum levels reach the <strong className="text-emerald-300">45–60 ng/mL</strong> optimal athletic zone.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Complete Longitudinal Blood Test Matrix */}
          <div className="card-panel rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-white">
                  Longitudinal Blood Biomarker Matrix ({(labs.history || []).length} Panels)
                </h2>
                <p className="text-xs text-slate-400">
                  {uiCopy.lab_source_note || "Structured biomarker history across recorded clinical lab reports."}
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {uiCopy.patient_summary || `${vitals.height_display} • ${vitals.weight_lbs} lbs`}
              </span>
            </div>

            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                  <tr>
                    <th className="py-2.5 px-3">Biomarker</th>
                    <th className="py-2.5 px-3">Optimal / Ref Range</th>
                    {(labs.history || []).map((rep, idx, arr) => (
                      <th
                        key={rep.id}
                        className={`py-2.5 px-3 text-right ${idx === arr.length - 1 ? "bg-indigo-950/40 text-indigo-200" : ""}`}
                      >
                        {rep.label || rep.date} {rep.age ? `(Age ${rep.age})` : ""}
                      </th>
                    ))}
                    <th className="py-2.5 px-3">Clinical Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {[
                    { name: "LDL Cholesterol (calc)", ref: "< 100 mg/dL", k: "ldl", flagHi: 100, note: "Primary lipid target (<100 mg/dL via low sat fat & soluble fiber)" },
                    { name: "Non-HDL Cholesterol", ref: "< 130 mg/dL", k: "non_hdl", flagHi: 130, note: "Total atherogenic cholesterol (LDL + VLDL)" },
                    { name: "Total Cholesterol", ref: "< 200 mg/dL", k: "total_cholesterol", flagHi: 200, note: "Overall circulating serum cholesterol" },
                    { name: "HDL Cholesterol", ref: "≥ 40 mg/dL", k: "hdl", flagLo: 40, note: "Supported by omega-3 fish & aerobic exercise" },
                    { name: "Triglycerides (Fasting)", ref: "< 150 mg/dL (Opt <60)", k: "triglycerides", flagHi: 150, warnHi: 75, note: "Reflects refined sugar & fat balance" },
                    { name: "Chol / HDL Ratio", ref: "< 5.0 (Opt <3.5)", k: "chol_hdl_ratio", flagHi: 5.0, note: "Composite lipid ratio" },
                    { name: "Vitamin D (25-OH Total)", ref: "30–100 ng/mL (Opt 45–60)", k: "vitamin_d", flagLo: 30, note: "Bone mineral density & tendon recovery support" },
                    { name: "Hemoglobin A1c", ref: "< 5.7%", k: "hba1c", flagHi: 5.7, note: "90-day glycemic average & insulin sensitivity" },
                    { name: "Glucose (Fasting)", ref: "65–99 mg/dL", k: "glucose", flagHi: 99, note: "Fasting morning metabolic baseline" },
                    { name: "Ferritin (Iron Store)", ref: "30–300 ng/mL", k: "ferritin", flagLo: 30, note: "Oxygen transport & endurance work capacity" },
                    { name: "BUN (Urea Nitrogen)", ref: "7–25 mg/dL", k: "bun", flagHi: 25, note: "Protein intake & hydration balance" },
                    { name: "Creatinine", ref: "0.60–1.24 mg/dL", k: "creatinine", flagHi: 1.27, note: "Expected range for lean muscle mass" },
                    { name: "eGFR (Kidney Filtration)", ref: "≥ 60 mL/min/1.73m²", k: "egfr", flagLo: 60, note: "Renal filtration indicator" },
                    { name: "AST (SGOT)", ref: "10–40 U/L", k: "ast", flagHi: 40, note: "Hepatic enzyme baseline" },
                    { name: "ALT (SGPT)", ref: "9–46 U/L", k: "alt", flagHi: 46, note: "Hepatic enzyme baseline" },
                    { name: "Alkaline Phosphatase", ref: "36–130 U/L", k: "alk_phos", flagHi: 130, note: "Normal biliary/bone turnover" },
                    { name: "Total Protein", ref: "6.1–8.1 g/dL", k: "protein_total", note: "Serum total protein & albumin nutrition status" },
                    { name: "WBC (White Blood Cells)", ref: "3.8–10.8 x10³/uL", k: "wbc", flagLo: 3.8, note: "Immune baseline" },
                    { name: "Absolute Neutrophils", ref: "1,500–7,800 cells/uL", k: "neutrophils_abs", flagLo: 1500, note: "Endurance athletic neutrophil count" },
                    { name: "Hemoglobin", ref: "13.2–17.1 g/dL", k: "hemoglobin", flagLo: 13.2, note: "Oxygen-carrying capacity" },
                    { name: "Platelets", ref: "140–400 x10³/uL", k: "platelets", flagHi: 400, note: "Normal clotting & tissue recovery" },
                    { name: "TSH (Thyroid)", ref: "0.40–4.50 mIU/L", k: "tsh", flagHi: 4.5, note: "Thyroid metabolic regulation" },
                  ]
                    .filter((row) => (labs.history || []).some((rep) => rep.metrics && rep.metrics[row.k] !== undefined))
                    .map((row) => {
                    const reports = labs.history || [];
                    const latestId = reports.length ? reports[reports.length - 1].id : "";
                    return (
                      <tr key={row.k} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-sans font-bold text-white">{row.name}</td>
                        <td className="py-2 px-3 text-slate-400">{row.ref}</td>
                        {reports.map((rep) => {
                          const val = rep.metrics?.[row.k];
                          const isHi = row.flagHi && val !== undefined && val >= row.flagHi;
                          const isLo = row.flagLo && val !== undefined && val < row.flagLo;
                          const isWarn = row.warnHi && val !== undefined && val >= row.warnHi && !isHi;
                          const isLatest = rep.id === latestId;
                          return (
                            <td
                              key={rep.id}
                              className={`py-2 px-3 text-right ${isLatest ? "bg-indigo-950/25 font-bold" : ""} ${
                                isHi
                                  ? "text-rose-400 font-bold"
                                  : isLo
                                  ? "text-amber-400 font-bold"
                                  : isWarn
                                  ? "text-amber-300"
                                  : "text-slate-200"
                              }`}
                            >
                              {val !== undefined ? (
                                <>
                                  {val}
                                  {isHi && <span className="ml-1 text-[9px] px-1 rounded bg-rose-500/20 text-rose-300">H</span>}
                                  {isLo && <span className="ml-1 text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">L</span>}
                                </>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2 px-3 font-sans text-[11px] text-slate-300">{row.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 2: AIR FRYER & 60-MIN MODULAR MEAL SYSTEM ==================== */}
      {activeSubTab === "meals" && (
        <div className="space-y-6">
          {/* 55-Minute Modular Weekend Prep Philosophy */}
          <div className="card-panel rounded-2xl p-5 space-y-4 border border-indigo-500/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="badge bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  ⏱️ EFFICIENCY, EFFICIENCY, EFFICIENCY • ZERO-SCRUB WORKFLOW
                </span>
                <h2 className="text-lg font-bold text-white mt-1">
                  Modular Weekly Meal Component System
                </h2>
                <p className="text-xs text-slate-300">{prepSystem.philosophy}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {(prepSystem.blocks || []).map((b, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-bold text-emerald-300">{b.step}</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{b.detail}</p>
                </div>
              ))}
            </div>

            {(prepSystem.chameleon_matrix || []).length > 0 && (
              <div className="p-4 rounded-xl bg-indigo-950/35 border border-indigo-500/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {uiCopy.meal_system_title || "ONE BASE PREP → MULTIPLE WEEKLY CUISINES"}
                    </span>
                    <h3 className="text-sm font-bold text-white mt-1">
                      {uiCopy.meal_system_subtitle || "Zero weekday repeats with 5–10 min evening assembly"}
                    </h3>
                  </div>
                </div>
                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-900/90 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="py-2 px-3">Training Day</th>
                        <th className="py-2 px-3">{uiCopy.prep_partner_col || "Partner Cuisine"}</th>
                        <th className="py-2 px-3">Base Component</th>
                        <th className="py-2 px-3">30-Second Finishing Twist</th>
                        <th className="py-2 px-3">{uiCopy.prep_owner_col || "Repeat-Efficiency Hack"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {(prepSystem.chameleon_matrix || []).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2 px-3 font-mono font-bold text-indigo-300">{row.night}</td>
                          <td className="py-2 px-3 font-bold text-white">{row.cuisine}</td>
                          <td className="py-2 px-3 text-slate-300">{row.base_used}</td>
                          <td className="py-2 px-3 text-emerald-300">{row.partner_twist}</td>
                          <td className="py-2 px-3 text-amber-200 text-[11px]">{row.owner_efficiency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="font-bold text-emerald-300">{uiCopy.zero_cleanup_title || "3 Zero-Cleanup Rules"}:</div>
              <div className="flex flex-wrap gap-3 text-[11px] text-slate-200">
                {(prepSystem.zero_cleanup_rules || []).map((r, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800">
                    ✓ {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Filter & Master-Detail Recipe Explorer */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {mealCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMealFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    mealFilter === cat
                      ? "bg-indigo-600 border-indigo-400 text-white"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Active Prep Filter:</span>
              {[
                { label: "All (≤8 min)", val: 99 },
                { label: "⚡ Ultra-Fast (≤5 min)", val: 5 },
                { label: "≤6 min", val: 6 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setMaxPrepFilter(opt.val)}
                  className={`px-2.5 py-1 rounded-lg border font-semibold ${
                    maxPrepFilter === opt.val
                      ? "bg-emerald-600 border-emerald-400 text-white"
                      : "bg-slate-900 border-slate-800 text-slate-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipe Grid + Active Recipe Card */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 5 Cols: Clickable Meal Cards */}
            <div className="lg:col-span-5 space-y-2.5">
              {filteredMeals.map((m) => {
                const isSel = activeMeal && activeMeal.id === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMealId(m.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition space-y-2 ${
                      isSel
                        ? "bg-indigo-950/60 border-indigo-400 shadow-lg"
                        : "card-panel hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">{m.category} • {m.appliance}</span>
                        <h3 className="text-sm font-bold text-white mt-0.5">{m.name}</h3>
                      </div>
                      <span className="badge bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                        {m.active_prep_min}m prep + {m.cook_time_min}m
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      Replaces: <strong className="text-slate-200">{m.replaces}</strong>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 pt-1 text-center font-mono text-[11px]">
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[9px] text-slate-400">PROTEIN</div>
                        <div className="font-bold text-emerald-400">{m.macros.protein_g}g</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[9px] text-slate-400">SAT FAT</div>
                        <div className="font-bold text-cyan-300">{m.macros.sat_fat_g}g</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[9px] text-slate-400">SOL FIBER</div>
                        <div className="font-bold text-amber-300">{m.macros.soluble_fiber_g}g</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[9px] text-slate-400">2 SERVINGS</div>
                        <div className="font-bold text-white">{fmtCurrency(m.cost_for_two)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right 7 Cols: Detailed Step-by-Step Air Fryer Execution Card */}
            {activeMeal && (
              <div className="lg:col-span-7 card-panel rounded-2xl p-6 space-y-5 border border-indigo-500/40">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge bg-indigo-500/20 text-indigo-300">{activeMeal.appliance}</span>
                      <span className="badge bg-emerald-500/20 text-emerald-300">🔥 {activeMeal.air_fryer_temp_f}°F for {activeMeal.cook_time_min} min</span>
                      <span className="badge bg-cyan-500/20 text-cyan-300">🧼 {activeMeal.cleanup_score}</span>
                    </div>
                    <h2 className="text-xl font-extrabold text-white">{activeMeal.name}</h2>
                    <p className="text-xs text-slate-400">
                      Home Upgrade for: <strong className="text-amber-300">{activeMeal.replaces}</strong>
                    </p>
                  </div>

                  <div className="text-right bg-emerald-950/40 border border-emerald-700/40 rounded-xl px-3.5 py-2">
                    <div className="text-[10px] uppercase font-bold text-emerald-300">Savings vs. Delivery</div>
                    <div className="text-lg font-extrabold font-mono text-emerald-400">
                      Save {fmtCurrency(activeMeal.delivery_equivalent - activeMeal.cost_for_two)} / dinner
                    </div>
                    <div className="text-[10px] font-mono text-slate-300">
                      {fmtCurrency(activeMeal.cost_for_two)} at home (for 2) vs {fmtCurrency(activeMeal.delivery_equivalent)} delivered
                    </div>
                  </div>
                </div>

                {/* Macro & Clinical Strip */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center font-mono">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Calories</div>
                    <div className="text-sm font-bold text-white">{activeMeal.macros.calories}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Protein</div>
                    <div className="text-sm font-bold text-emerald-400">{activeMeal.macros.protein_g}g</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Sat Fat</div>
                    <div className="text-sm font-bold text-cyan-300">{activeMeal.macros.sat_fat_g}g</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Soluble Fiber</div>
                    <div className="text-sm font-bold text-amber-300">{activeMeal.macros.soluble_fiber_g}g</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Total Fiber</div>
                    <div className="text-sm font-bold text-indigo-300">{activeMeal.macros.total_fiber_g}g</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-400">Vitamin D</div>
                    <div className="text-sm font-bold text-amber-400">{activeMeal.macros.vitamin_d_iu} IU</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(activeMeal.ldl_tags || []).map((t, i) => (
                    <span key={i} className="badge bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      🧬 {t}
                    </span>
                  ))}
                  <span className="badge bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    🧗 {activeMeal.climber_benefit}
                  </span>
                </div>

                {/* Split Ingredients: Costco Bulk vs Met Market / Whole Foods */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-amber-300">🛒 From Your Costco Freezer / Pantry</div>
                    <ul className="space-y-1 text-xs text-slate-200 list-disc pl-4">
                      {(activeMeal.ingredients_costco || []).map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                    <div className="text-xs font-bold text-emerald-300">🥬 From Met Market / Whole Foods</div>
                    <ul className="space-y-1 text-xs text-slate-200 list-disc pl-4">
                      {(activeMeal.ingredients_met_wf || []).map((ing, i) => (
                        <li key={i}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 4-Step Execution */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    ⚡ Step-by-Step ({activeMeal.active_prep_min} Min Active Hands-On Time)
                  </div>
                  <div className="space-y-2">
                    {(activeMeal.steps || []).map((st, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200">
                        {st}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-800/40 text-xs text-indigo-200">
                  <strong>🥡 Batch &amp; Leftover Longevity:</strong> {activeMeal.batch_longevity}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 3: MACROS, BREAKFAST, WORKPLACE CAFE & NIGHT SNACKS ==================== */}
      {activeSubTab === "macros" && (
        <div className="space-y-6">
          {/* Top Interactive Calorie & Macro Calculator */}
          <div className="card-panel rounded-2xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <span className="badge bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {vitals.height_display} • {vitals.wingspan_display} • {vitals.weight_lbs} lbs ({vitals.weight_kg} kg) • {vitals.training_split_summary}
                </span>
                <h2 className="text-lg font-bold text-white mt-1">
                  Interactive Body Recomposition, Calorie, Protein &amp; Lipid Target Calculator
                </h2>
              </div>

              {/* Day Type & Goal Mode Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "climbing", label: `${(uiCopy.activity_day_labels && uiCopy.activity_day_labels.climbing) || "Primary Training"} (${vitals.climbing_day_kcal} kcal)` },
                  { id: "training", label: `${(uiCopy.activity_day_labels && uiCopy.activity_day_labels.training) || "Workout Day"} (${vitals.training_day_kcal} kcal)` },
                  { id: "rest", label: `${(uiCopy.activity_day_labels && uiCopy.activity_day_labels.rest) || "Rest Day"} (${vitals.rest_day_kcal} kcal)` },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => updateInputs({ day_type: d.id })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      inputs.day_type === d.id
                        ? "bg-indigo-600 border-indigo-400 text-white"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}

                <select
                  value={inputs.goal_mode || "recomp_performance"}
                  onChange={(e) => updateInputs({ goal_mode: e.target.value })}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-emerald-300"
                >
                  {(uiCopy.goal_options || [
                    { id: "recomp_performance", label: "Goal: Body Recomp (Balanced Deficit)" },
                    { id: "lean_send", label: "Goal: Lean Cut (-300 kcal/d)" },
                    { id: "muscle_build", label: "Goal: Lean Muscle (+180 kcal/d)" },
                  ]).map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6 Daily Macro Targets */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] font-bold uppercase text-slate-400">Daily Calories</div>
                <div className="text-xl font-extrabold font-mono text-white mt-0.5">{vitals.active_target_kcal} kcal</div>
                <div className="text-[10px] text-slate-400">BMR: {vitals.bmr_kcal} kcal/d</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-800/50">
                <div className="text-[10px] font-bold uppercase text-emerald-300">Climber Protein</div>
                <div className="text-xl font-extrabold font-mono text-emerald-400 mt-0.5">{vitals.protein_g}g / day</div>
                <div className="text-[10px] text-slate-400">2.15g/kg for tendon/muscle repair</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-rose-800/50">
                <div className="text-[10px] font-bold uppercase text-rose-300">Sat Fat Hard Cap</div>
                <div className="text-xl font-extrabold font-mono text-rose-400 mt-0.5">&le; {vitals.sat_fat_cap_g}g / day</div>
                <div className="text-[10px] text-slate-400">&lt;5% kcal to drive LDL &lt;100</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-amber-800/50">
                <div className="text-[10px] font-bold uppercase text-amber-300">Viscous Soluble Fiber</div>
                <div className="text-xl font-extrabold font-mono text-amber-400 mt-0.5">&ge; {vitals.soluble_fiber_target_g}g / day</div>
                <div className="text-[10px] text-slate-400">{vitals.total_fiber_target_g}g total fiber (binds bile)</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] font-bold uppercase text-indigo-300">Clean Carbs</div>
                <div className="text-xl font-extrabold font-mono text-indigo-300 mt-0.5">{vitals.carbs_g}g / day</div>
                <div className="text-[10px] text-slate-400">Forearm glycogen &amp; power</div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-[10px] font-bold uppercase text-cyan-300">Heart-Healthy Fats</div>
                <div className="text-xl font-extrabold font-mono text-cyan-300 mt-0.5">{vitals.total_fat_g}g / day</div>
                <div className="text-[10px] text-slate-400">EVOO, Salmon, Avocado, Walnuts</div>
              </div>
            </div>

            {/* 5-Slot Daily Calorie & Night-Snack Schedule */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                ⏰ Your 5-Slot Daily Fuel Architecture (With Pre-Budgeted 10 PM Night Snack Window!)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
                {(vitals.meal_calorie_split || []).map((slot, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                    <div className="text-xs font-bold text-white">{slot.slot}</div>
                    <div className="text-base font-extrabold font-mono text-indigo-300">{slot.calories} kcal</div>
                    <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{slot.protein_g}g Pro</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">{slot.soluble_fiber_g}g SolFib</span>
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">&le;{slot.sat_fat_max_g}g Sat</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">{slot.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section A: The "I Hate Eating Breakfast" 60-Second Protocol */}
          <div className="card-panel rounded-2xl p-5 space-y-4 border border-amber-500/30">
            <div>
              <span className="badge bg-amber-500/20 text-amber-300 border border-amber-500/30">
                🌅 FOR SOMEONE WHO HATES BREAKFAST • 30–90 SECONDS • ZERO COOKING
              </span>
              <h2 className="text-lg font-bold text-white mt-1">
                Why Skipping Breakfast Raises Your LDL — And 4 Effortless 60-Second Fixes
              </h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {breakfast.why_breakfast_matters_for_ldl_and_climbing}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {(breakfast.options || []).map((opt) => (
                <div key={opt.id} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-bold text-white">{opt.name}</div>
                    <span className="badge bg-emerald-500/20 text-emerald-300 font-mono shrink-0">{opt.prep_sec} sec</span>
                  </div>
                  <div className="text-[11px] text-indigo-300 italic">{opt.vibe}</div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-white">{opt.calories} kcal</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300">{opt.protein_g}g Protein</span>
                    <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300">{opt.soluble_fiber_g}g Soluble Fiber</span>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300">{opt.sat_fat_g}g Sat Fat</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    <strong>How to make:</strong> {opt.recipe}
                  </p>
                  <div className="text-[11px] text-emerald-400">
                    <strong>LDL &amp; Climbing Impact:</strong> {opt.ldl_impact}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section B: Workplace Cafe Playbook & Late-Night Snack Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Workplace Cafe Playbook (5 Cols) */}
            <div className="lg:col-span-5 card-panel rounded-2xl p-5 space-y-4">
              <div>
                <span className="badge bg-indigo-500/20 text-indigo-300">{uiCopy.workplace_cafe_badge || "WORKPLACE CAFE PLAYBOOK"}</span>
                <h2 className="text-base font-bold text-white mt-1">
                  {uiCopy.workplace_cafe_title || "Smart Campus Cafeteria Swaps for Heart-Healthy Macros"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">{workplaceCafe.overview}</p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/50 space-y-1.5">
                  <div className="font-bold text-emerald-300">Always Grab (Green Light)</div>
                  {(workplaceCafe.green_light || []).map((g, i) => (
                    <p key={i} className="text-[11px] text-slate-200 leading-relaxed">{g}</p>
                  ))}
                </div>
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/50 space-y-1.5">
                  <div className="font-bold text-amber-300">Portion-Control / Modify (Yellow Light)</div>
                  {(workplaceCafe.yellow_light || []).map((y, i) => (
                    <p key={i} className="text-[11px] text-slate-200 leading-relaxed">{y}</p>
                  ))}
                </div>
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-800/50 space-y-1.5">
                  <div className="font-bold text-rose-300">Skip on Weekdays (Hidden Saturated Fat Traps)</div>
                  {(workplaceCafe.red_light || []).map((r, i) => (
                    <p key={i} className="text-[11px] text-slate-200 leading-relaxed">{r}</p>
                  ))}
                </div>
              </div>
            </div>

            {/* Late-Night Snack Swap Matrix (7 Cols) */}
            <div className="lg:col-span-7 card-panel rounded-2xl p-5 space-y-4">
              <div>
                <span className="badge bg-purple-500/20 text-purple-300">🌙 LATE-NIGHT SNACKING PROTOCOL (300–350 KCAL BUDGETED)</span>
                <h2 className="text-base font-bold text-white mt-1">
                  5 Night Snacks That Satisfy Cravings While Lowering LDL Overnight
                </h2>
                <p className="text-xs text-slate-400 mt-1">{nightSnacks.strategy}</p>
              </div>

              <div className="space-y-2.5">
                {(nightSnacks.swaps || []).map((s, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-amber-300">When You Crave: {s.craving}</span>
                        <div className="text-sm font-bold text-white">{s.swap_name}</div>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white">{s.calories} kcal</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">{s.protein_g}g Pro</span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">{s.soluble_fiber_g}g SolFib</span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">{s.sat_fat_g}g Sat</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-200"><strong>Prep:</strong> {s.prep}</p>
                    <p className="text-[11px] text-emerald-400"><strong>Why it works:</strong> {s.why_it_works}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 4: GROCERY ROUTING ENGINE ==================== */}
      {activeSubTab === "groceries" && (
        <div className="space-y-6">
          <div className="card-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">
                {uiCopy.grocery_section_title || "Weekly High-Efficiency Grocery Routing"}
              </h2>
              <p className="text-xs text-slate-400">
                Click any item to check it off as stocked in your pantry/freezer. Checked state saves automatically.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {storeTabs.map((st) => (
                <button
                  key={st}
                  onClick={() => setStoreFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                    storeFilter === st
                      ? "bg-indigo-600 border-indigo-400 text-white"
                      : "bg-slate-900 border-slate-800 text-slate-300"
                  }`}
                >
                  {st}
                </button>
              ))}
              {checkedSet.size > 0 && (
                <button
                  onClick={() => toggleGroceryItem("", true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Uncheck All ({checkedSet.size})
                </button>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {groceryStores
              .filter((st) => storeFilter === "All" || (st.store || "").startsWith(storeFilter))
              .map((storeObj, sIdx) => (
                <div key={sIdx} className="card-panel rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-base font-bold text-white">{storeObj.store}</h3>
                      <p className="text-xs text-emerald-400 font-semibold">{storeObj.cadence}</p>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-sm font-bold text-white">Est. Basket: {fmtCurrency(storeObj.avg_trip_budget)}</div>
                      <div className="text-[11px] text-slate-400">
                        Yields ~{storeObj.meals_yielded} high-protein meals ({fmtCurrency(storeObj.avg_trip_budget / storeObj.meals_yielded)}/meal)
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(storeObj.items || []).map((item, idx) => {
                      const isChecked = checkedSet.has(item.name);
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleGroceryItem(item.name)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                            isChecked
                              ? "bg-emerald-950/25 border-emerald-700/40 opacity-65"
                              : "bg-slate-950/70 border-slate-800 hover:border-indigo-500/40"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="mt-1 h-4 w-4 rounded accent-emerald-500"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-xs font-bold ${isChecked ? "line-through text-slate-400" : "text-white"}`}>
                                {item.name}
                              </span>
                              <span className="font-mono text-xs font-bold text-emerald-400 shrink-0">
                                {fmtCurrency(item.price)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">{item.category}</span>
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-300">{item.servings} servings</span>
                              {item.protein_per_serv_g > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{item.protein_per_serv_g}g Pro/serv</span>
                              )}
                              <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">{item.sat_fat_g}g Sat Fat</span>
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">⏳ {item.shelf_life}</span>
                            </div>
                            <p className="text-[11px] text-slate-400">{item.why}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ==================== SUB-TAB 5: UBER EATS VS. HOME KITCHEN ROI ==================== */}
      {activeSubTab === "roi" && (
        <div className="space-y-6">
          {/* Interactive Delivery Replacement & Wealth Arbitrage Simulator */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 card-panel rounded-2xl p-5 space-y-4 border border-emerald-500/30">
              <div>
                <span className="badge bg-emerald-500/20 text-emerald-300">💸 UBER EATS → HOME AIR FRYER ARBITRAGE</span>
                <h2 className="text-base font-bold text-white mt-1">
                  Interactive Delivery Replacement &amp; FIRE Wealth Simulator
                </h2>
                <p className="text-xs text-slate-400">
                  In the last 12 months, you placed <strong>{econ.delivery_order_count} delivery orders ({fmtCurrency(econ.total_delivery_12m)})</strong> averaging{" "}
                  <strong>{fmtCurrency(econ.avg_delivery_order)}/order</strong> (with {econ.orders_over_100_count} orders over $100, up to {fmtCurrency(econ.max_delivery_order)}).
                </p>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-semibold">Replace Delivery Orders / Week (Current avg: 1.65/wk)</span>
                    <span className="font-mono font-bold text-emerald-400">{inputs.replace_delivery_meals_wk} orders/wk</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2.5"
                    step="0.25"
                    value={inputs.replace_delivery_meals_wk ?? 1.5}
                    onChange={(e) => updateInputs({ replace_delivery_meals_wk: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-semibold">Replace Dine-Out / Takeout Meals / Week</span>
                    <span className="font-mono font-bold text-indigo-400">{inputs.replace_dineout_meals_wk} meals/wk</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="4.0"
                    step="0.5"
                    value={inputs.replace_dineout_meals_wk ?? 1.5}
                    onChange={(e) => updateInputs({ replace_dineout_meals_wk: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-semibold">{uiCopy.home_cost_label || "Home Meal Cost for Two"}</span>
                    <span className="font-mono font-bold text-cyan-300">{fmtCurrency(inputs.home_meal_cost_for_two)} total</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="24"
                    step="0.5"
                    value={inputs.home_meal_cost_for_two ?? 12.5}
                    onChange={(e) => updateInputs({ home_meal_cost_for_two: parseFloat(e.target.value) })}
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-700/40">
                  <div className="text-[10px] uppercase font-bold text-emerald-300">Annual Cash Saved</div>
                  <div className="text-xl font-extrabold font-mono text-emerald-400">+{fmtCurrency(roiSim.annual_cash_saved)}/yr</div>
                  <div className="text-[11px] text-slate-300">+{fmtCurrency(roiSim.monthly_cash_saved)}/mo net cashflow</div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-700/40">
                  <div className="text-[10px] uppercase font-bold text-indigo-300">Compounded @ FIRE Horizon</div>
                  <div className="text-xl font-extrabold font-mono text-indigo-300">+{fmtCurrency(roiSim.compounded_savings || roiSim.fire_age_38_compounded)}</div>
                  <div className="text-[11px] text-slate-300">Or {roiSim.pct_of_goal || roiSim.pct_of_60k_mortgage_cap_goal}%/yr toward major goal</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-700/40 col-span-2">
                  <div className="text-[10px] uppercase font-bold text-rose-300">Health Dividend ({roiSim.meals_swapped_yr} Home Meals/Yr)</div>
                  <div className="text-base font-extrabold font-mono text-white">
                    Eliminates {(roiSim.sat_fat_avoided_grams_yr || 0).toLocaleString()}g of Saturated Fat / Year (~{((roiSim.sat_fat_avoided_grams_yr || 0) / 453.6).toFixed(1)} lbs of pure fat!)
                  </div>
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Monthly Stacked Food Spend Chart */}
            <div className="lg:col-span-7 card-panel rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-white">
                    📊 Monthly Food Breakdown: Delivery vs. Restaurant Dine-Out vs. Groceries
                  </h2>
                  <p className="text-xs text-slate-400">
                    Total 12M Food: {fmtCurrency(econ.total_food_12m)} ({fmtCurrency(econ.total_dining_12m)} Dining/Delivery vs. {fmtCurrency(econ.total_groceries_12m)} Groceries — {econ.dining_to_grocery_ratio}x ratio)
                  </p>
                </div>
              </div>

              {ChartCanvas && (
                <ChartCanvas
                  type="bar"
                  height={280}
                  isDark={isDark}
                  data={foodSpendChartData}
                  options={{
                    plugins: {
                      legend: { position: "top", labels: { color: isDark ? "#cbd5e1" : "#334155", boxWidth: 12, font: { size: 11 } } },
                    },
                    scales: {
                      x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: isDark ? "#cbd5e1" : "#334155" },
                      },
                      y: {
                        stacked: true,
                        grid: { color: isDark ? "rgba(51,65,85,0.35)" : "rgba(203,213,225,0.6)" },
                        ticks: {
                          color: isDark ? "#94a3b8" : "#475569",
                          callback: (v) => `$${v}`,
                        },
                      },
                    },
                  }}
                />
              )}
            </div>
          </div>

          {/* Top Delivery Orders >= $100 & Top Food Merchants Table */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card-panel rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">
                🚨 Highest-Cost Single Delivery Orders (The &quot;$120+ Single Delivery Meal&quot; Audit)
              </h3>
              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Platform</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Air-Fryer Savings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(econ.top_delivery_orders || []).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-300">{tx.tx_date}</td>
                        <td className="py-2 px-3 font-sans font-semibold text-white">{tx.merchant}</td>
                        <td className="py-2 px-3 text-right font-bold text-rose-400">{fmtCurrency(tx.amount)}</td>
                        <td className="py-2 px-3 text-right text-emerald-400">
                          +{fmtCurrency(Math.max(0, tx.amount - roiSim.home_meal_cost_for_two))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card-panel rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">
                🍱 Top 18 Food &amp; Grocery Merchants (Nov 2025 – Oct 2026)
              </h3>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="py-2 px-3">Merchant</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3 text-right">Orders</th>
                      <th className="py-2 px-3 text-right">Total</th>
                      <th className="py-2 px-3 text-right">Avg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(econ.top_merchants || []).map((m, i) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-sans font-semibold text-white">{m.merchant}</td>
                        <td className="py-2 px-3 font-sans">
                          <span
                            className={`badge ${
                              m.sub_type === "delivery"
                                ? "bg-rose-500/20 text-rose-300"
                                : m.sub_type === "groceries"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {m.sub_type === "delivery" ? "Delivery" : m.sub_type === "groceries" ? "Grocery" : "Dine-Out"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">{m.count}</td>
                        <td className="py-2 px-3 text-right font-bold text-white">{fmtCurrency(m.total)}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{fmtCurrency(m.total / Math.max(1, m.count))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

"""Sports PT, Climbing Injury Rehab, Guided Workout Timer & Full-Body Diagnostics Engine.

All personal injury histories and athlete-specific anatomy notes load dynamically from
`backend.profile_loader.get_rehab_profile()`:
- Local Private Mode reads gitignored `private/profile.json` + local SQLite `data/finance.db`.
- Public Demo Mode reads synthetic sample data from `backend/demo_profile.json`.

This module contains strictly generic clinical sports-medicine protocols, exercise guides,
triage algorithms, and full-body asymmetry diagnostics (zero personal PII).
"""
from datetime import datetime
from urllib.parse import quote_plus

from backend.db import get_connection, bump_db_stamp
from backend.profile_loader import get_rehab_profile, is_private_profile_loaded


CLINICAL_DISCLAIMER = (
    "Educational sports-PT coaching & self-monitoring tool — not a substitute for an in-person "
    "medical diagnosis or imaging. Stop immediately and consult a licensed physical therapist or "
    "sports physician if you experience joint locking, sudden audible pops, numbness/tingling, "
    "visible tendon bowstringing, inability to bear weight, or escalating rest/night pain."
)


def _yt(query):
    return "https://www.youtube.com/results?search_query={0}".format(quote_plus(query))


def _is_demo_mode():
    return not is_private_profile_loaded()


def _ensure_rehab_tables(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS rehab_injuries (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body_region TEXT NOT NULL,
            side TEXT DEFAULT 'bilateral',
            tissue_type TEXT DEFAULT 'tendon',
            suspected_grade TEXT DEFAULT 'Grade 1',
            phase TEXT DEFAULT 'subacute',
            status TEXT DEFAULT 'active',
            onset_date TEXT DEFAULT '',
            mechanism TEXT DEFAULT '',
            symptoms TEXT DEFAULT '',
            anatomy_note TEXT DEFAULT '',
            climbing_modifications TEXT DEFAULT '',
            red_flags TEXT DEFAULT '',
            protocol_id TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_demo INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS rehab_daily_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL,
            injury_id TEXT NOT NULL,
            pain_rest INTEGER DEFAULT 0,
            pain_load INTEGER DEFAULT 0,
            morning_stiffness INTEGER DEFAULT 0,
            swelling INTEGER DEFAULT 0,
            warmup_minutes INTEGER DEFAULT 0,
            climbed_today INTEGER DEFAULT 0,
            session_rpe INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(log_date, injury_id)
        );

        CREATE TABLE IF NOT EXISTS rehab_workout_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_date TEXT NOT NULL,
            protocol_id TEXT NOT NULL,
            protocol_title TEXT NOT NULL,
            duration_sec INTEGER DEFAULT 0,
            exercises_completed INTEGER DEFAULT 0,
            total_exercises INTEGER DEFAULT 0,
            post_pain INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS rehab_assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assessed_date TEXT NOT NULL,
            test_id TEXT NOT NULL,
            left_val REAL,
            right_val REAL,
            bilateral_val REAL,
            unit TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


EXERCISES = {
    "tendon_glides": {
        "id": "tendon_glides",
        "name": "3-Position Finger Tendon Glides",
        "region": "fingers",
        "target_tissues": "FDP / FDS Flexor Tendons & A2–A4 Pulley Sheaths",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "10 slow cycles / set",
        "rest_sec": 20,
        "side_mode": "bilateral",
        "tempo": "2s per position (Smooth)",
        "pain_ceiling": "0–1 / 10 (Pain-free glide)",
        "visual_key": "finger_glides",
        "cues": [
            "Start with fingers completely straight and relaxed (tabletop/open palm).",
            "Curl only the DIP & PIP joints into a hook fist while keeping the base knuckles straight.",
            "Transition smoothly into a flat tabletop fist, then a gentle full fist, and open slowly.",
            "Promotes synovial fluid exchange around the flexor sheath without stressing the A2 pulley."
        ],
        "avoid": "Never force end-range flexion against sharp palmar-base tenderness or squeeze hard into a ball.",
        "video_title": "Hooper's Beta — Finger Tendon Glides for Pulley Recovery",
        "video_url": _yt("Hoopers Beta finger tendon glides climber pulley rehab"),
    },
    "open_hand_density_hang": {
        "id": "open_hand_density_hang",
        "name": "20mm Open-Hand / 3-Finger Drag Isometric",
        "region": "fingers",
        "target_tissues": "A2 Pulley & Flexor Tendon Collagen Remodeling",
        "sets": 4,
        "work_sec": 20,
        "reps_label": "20s sub-max hold (30–50% effort)",
        "rest_sec": 45,
        "side_mode": "bilateral",
        "tempo": "Isometric steady tension",
        "pain_ceiling": "≤ 2 / 10 during hold, 0/10 morning after",
        "visual_key": "open_hand_edge",
        "cues": [
            "Keep feet on the floor (or use a portable pickup edge / loading pin) so you control exact load.",
            "Use an open-hand / 3-finger drag position — index, middle, ring extended gently at the PIP.",
            "Gradually ramp tension over 3 seconds to 30–50% effort; hold steady for 20s.",
            "Stop immediately if discomfort exceeds 2/10 or radiates laterally at the finger base."
        ],
        "avoid": "Strictly NO closed crimping or half-crimping above 90° PIP flexion when ring-finger base bumps are reactive.",
        "video_title": "The Climbing Doctor — Progressive Pulley Loading Protocol",
        "video_url": _yt("The Climbing Doctor A2 pulley rehab progressive loading"),
    },
    "finger_h_tape_check": {
        "id": "finger_h_tape_check",
        "name": "H-Taping & Lateral Sheath Gentle Mobility",
        "region": "fingers",
        "target_tissues": "A2 / Proximal Phalanx Ligamentous Support",
        "sets": 2,
        "work_sec": 40,
        "reps_label": "Apply H-tape + gentle 30s active flexion",
        "rest_sec": 15,
        "side_mode": "bilateral",
        "tempo": "Controlled setup",
        "pain_ceiling": "0–1 / 10",
        "visual_key": "finger_h_tape",
        "cues": [
            "Tear a 1.5-inch strip of rigid zinc-oxide climbing tape split longitudinally into an 'H' shape.",
            "Place the bridge over the palmar side of the proximal phalanx / PIP crease with two tails above and below.",
            "Wrap snugly enough to cue posture and unload the A2/A3 junction without cutting off circulation.",
            "For long fingers with lateral base soreness, avoid hyper-flexion twists during taping."
        ],
        "avoid": "Do not tape tightly over an inflamed bump expecting it to replace rest or load reduction.",
        "video_title": "Hooper's Beta — How to H-Tape a Finger Pulley Correctly",
        "video_url": _yt("Hoopers Beta how to H tape climbing finger pulley"),
    },
    "extensor_rice_bucket": {
        "id": "extensor_rice_bucket",
        "name": "Finger Extensor Balance & Lumbrical Spread",
        "region": "fingers",
        "target_tissues": "Forearm Extensors, Interossei & Lumbricals",
        "sets": 3,
        "work_sec": 35,
        "reps_label": "15 controlled finger spreads + reverse curls",
        "rest_sec": 20,
        "side_mode": "bilateral",
        "tempo": "2s open / 2s return",
        "pain_ceiling": "≤ 1 / 10",
        "visual_key": "extensor_spread",
        "cues": [
            "Place a light resistance band around the distal phalanges or submerge hand in a rice bucket.",
            "Spread all five digits evenly outward against mild resistance, feeling the back of the forearm work.",
            "Finish with gentle lumbrical sweeps (tabletop flexion to full extension) for blood flow."
        ],
        "avoid": "Avoid heavy snapping extensions that irritate collateral ligaments at the finger base.",
        "video_title": "Climbing Antagonist Finger Extensor & Rice Bucket Routine",
        "video_url": _yt("climbing rice bucket finger extensor workout rehab"),
    },
    "turf_toe_tape_setup": {
        "id": "turf_toe_tape_setup",
        "name": "1st MTP Turf-Toe Protection & Unloading Check",
        "region": "toe_foot",
        "target_tissues": "1st MTP Plantar Plate, Collateral Capsule & Sesamoids",
        "sets": 2,
        "work_sec": 45,
        "reps_label": "Check stiff sole + figure-8 extension check",
        "rest_sec": 15,
        "side_mode": "bilateral",
        "tempo": "Careful alignment",
        "pain_ceiling": "0–1 / 10",
        "visual_key": "toe_tape",
        "cues": [
            "Anchor a rigid tape strip around the midfoot and around the big toe proximal phalanx.",
            "Apply two crossing plantar straps from big toe to midfoot while holding the big toe in slight plantarflexion (5–10° down).",
            "This physically blocks painful passive hyperextension (dorsiflexion) while walking or edging.",
            "Pair with a stiff-soled approach shoe or flat stiff climbing shoe on the injured side."
        ],
        "avoid": "Do NOT climb in soft downturn shoes or smear-pop off the injured big toe during the acute phase.",
        "video_title": "E3 Rehab / Sports PT — Turf Toe Taping Technique",
        "video_url": _yt("turf toe taping physical therapy big toe sprain"),
    },
    "great_toe_rom_glides": {
        "id": "great_toe_rom_glides",
        "name": "Pain-Free Active Great-Toe ROM Glides",
        "region": "toe_foot",
        "target_tissues": "1st MTP Joint Capsule & Flexor Hallucis Brevis",
        "sets": 3,
        "work_sec": 40,
        "reps_label": "12 gentle active curls & lifts",
        "rest_sec": 20,
        "side_mode": "bilateral",
        "tempo": "2s flex / 2s extend",
        "pain_ceiling": "≤ 2 / 10 (Stop before pinch)",
        "visual_key": "toe_rom",
        "cues": [
            "Sit barefoot with foot resting flat or heel propped slightly off the floor.",
            "Gently curl the big toe downward, then actively lift it toward the shin only within pain-free range.",
            "Focus on clean joint gliding without cramping the arch."
        ],
        "avoid": "Never passively crank the big toe upward into hyperextension to 'test' if it still hurts.",
        "video_title": "Big Toe Mobility & Turf Toe Early Rehab Exercises",
        "video_url": _yt("big toe sprain turf toe early rehab mobility exercises"),
    },
    "toe_yoga_isolation": {
        "id": "toe_yoga_isolation",
        "name": "Toe Yoga (Isolated 1st Toe Press vs. Lesser Toes)",
        "region": "toe_foot",
        "target_tissues": "Flexor Hallucis Brevis & Intrinsic Foot Stabilizers",
        "sets": 3,
        "work_sec": 40,
        "reps_label": "10 alternating presses per side",
        "rest_sec": 20,
        "side_mode": "per_side",
        "tempo": "2s hold each toggle",
        "pain_ceiling": "≤ 2 / 10",
        "visual_key": "toe_yoga",
        "cues": [
            "Stand or sit with full tripod contact (heel, 1st met head, 5th met head).",
            "Press ONLY the big toe gently into the floor while lifting toes 2–5 upward.",
            "Reverse: keep toes 2–5 anchored down while gently hovering the big toe within pain-free range."
        ],
        "avoid": "Do not curl/claw the big toe under; press the pad straight down to load the plantar plate safely.",
        "video_title": "Squat University — Toe Yoga & Big Toe Stability",
        "video_url": _yt("Squat University toe yoga big toe stability"),
    },
    "short_foot_doming": {
        "id": "short_foot_doming",
        "name": "Short-Foot Arch Doming Isometric",
        "region": "toe_foot",
        "target_tissues": "Plantar Intrinsic Muscles & 1st Ray Stability",
        "sets": 3,
        "work_sec": 35,
        "reps_label": "6 x 5s arch holds per foot",
        "rest_sec": 20,
        "side_mode": "per_side",
        "tempo": "5s isometric squeeze",
        "pain_ceiling": "≤ 2 / 10",
        "visual_key": "short_foot",
        "cues": [
            "Keep heel and all toe pads flat on the ground.",
            "Draw the ball of the big toe toward the heel without curling the toes, lifting the medial arch.",
            "Essential for edging power in climbing shoes without over-stressing the 1st MTP capsule."
        ],
        "avoid": "Avoid scrunching toes into a fist — keep toes long and flat.",
        "video_title": "Short Foot Exercise for Foot Arch & Climbing Edging Power",
        "video_url": _yt("short foot exercise physical therapy arch strength"),
    },
    "progressive_heel_raise_toe": {
        "id": "progressive_heel_raise_toe",
        "name": "Controlled Double-to-Single Heel Raise (1st MTP Check)",
        "region": "toe_foot",
        "target_tissues": "1st MTP Plantar Plate Tolerance & Gastroc-Soleus",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "10–12 slow reps (stop at pain > 2/10)",
        "rest_sec": 30,
        "side_mode": "bilateral",
        "tempo": "2s up / 2s pause / 3s down",
        "pain_ceiling": "≤ 2 / 10",
        "visual_key": "calf_raise",
        "cues": [
            "Start with both feet flat on the floor (no step drop) and lift heels only half to three-quarters height.",
            "Distribute pressure evenly across the big toe mound and 2nd toe mound without rolling onto the pinky edge.",
            "Progress to single-leg only once double-leg flat raises are completely pain-free for 48 hours."
        ],
        "avoid": "Do not push to max heel height or drop off a ledge if 1st MTP extension causes sharp pinching.",
        "video_title": "Turf Toe Strengthening & Calf Raise Progression",
        "video_url": _yt("turf toe rehab progression heel raises physical therapy"),
    },
    "banded_clamshell_iso": {
        "id": "banded_clamshell_iso",
        "name": "Banded Clamshell + 3s Top Isometric Hold",
        "region": "knee",
        "target_tissues": "Gluteus Medius & External Rotators (Unloads Knee LCL)",
        "sets": 3,
        "work_sec": 40,
        "reps_label": "12 reps + 3s squeeze per side",
        "rest_sec": 20,
        "side_mode": "per_side",
        "tempo": "2s open / 3s hold / 2s close",
        "pain_ceiling": "0–1 / 10",
        "visual_key": "clamshell",
        "cues": [
            "Lie on your side with hips stacked at 45° and knees bent at 90°, band just above knees.",
            "Rotate the top knee upward without letting the pelvis roll backward.",
            "Strong hip external rotators prevent knees from collapsing into varus/valgus torque on drop-knees."
        ],
        "avoid": "Do not roll your torso back to cheat extra range — keep hips stacked perpendicular to the floor.",
        "video_title": "E3 Rehab — Glute Medius Clamshell & Lateral Knee Stability",
        "video_url": _yt("E3 Rehab banded clamshell lateral knee stability"),
    },
    "spanish_squat_iso": {
        "id": "spanish_squat_iso",
        "name": "Wall Sit / Banded Spanish Squat Isometric",
        "region": "knee",
        "target_tissues": "Quadriceps, Patellar/Lateral Knee Co-Contraction",
        "sets": 4,
        "work_sec": 45,
        "reps_label": "45s isometric hold (60–75° knee bend)",
        "rest_sec": 45,
        "side_mode": "bilateral",
        "tempo": "Static isometric",
        "pain_ceiling": "≤ 2 / 10",
        "visual_key": "wall_sit",
        "cues": [
            "Keep shins nearly vertical with knees tracking cleanly over the 2nd–3rd toes.",
            "Press feet evenly into the floor (engage both quads and hamstrings for balanced knee joint compression).",
            "Builds pain-relieving isometric strength around the LCL without varus opening."
        ],
        "avoid": "Do not let knees bow outward (varus) or cave inward (valgus) during fatigue.",
        "video_title": "Spanish Squat & Wall Sit Isometric for Knee Rehab",
        "video_url": _yt("E3 Rehab spanish squat isometric knee rehab"),
    },
    "lateral_step_down_eccentric": {
        "id": "lateral_step_down_eccentric",
        "name": "Controlled Eccentric Step-Down (Alignment Focus)",
        "region": "knee",
        "target_tissues": "Lateral Knee Dynamic Control, Quads & Glute Medius",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "10 slow lowers per leg",
        "rest_sec": 25,
        "side_mode": "per_side",
        "tempo": "3s lower / tap heel / 1s up",
        "pain_ceiling": "≤ 2 / 10",
        "visual_key": "step_down",
        "cues": [
            "Stand on a 4–6 inch step or sturdy plate/box with pelvis completely level.",
            "Hinge slightly at the hip and slowly lower the opposite heel to tap the floor over 3 seconds.",
            "Watch your kneecap in a mirror: keep it centered over the 2nd toe from start to finish."
        ],
        "avoid": "Do not bounce off the bottom foot or allow lateral knee drift/wobble.",
        "video_title": "Lateral Step-Down Exercise for Knee Ligament & ITB Rehab",
        "video_url": _yt("lateral step down exercise knee physical therapy"),
    },
    "single_leg_rdl_reach": {
        "id": "single_leg_rdl_reach",
        "name": "Single-Leg RDL (Biceps Femoris & Lateral Hip Control)",
        "region": "knee",
        "target_tissues": "Lateral Hamstring (Biceps Femoris) & Hip Stabilizers",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "8–10 slow reps per side",
        "rest_sec": 25,
        "side_mode": "per_side",
        "tempo": "3s hinge / 1s stand",
        "pain_ceiling": "≤ 2 / 10",
        "visual_key": "single_leg_rdl",
        "cues": [
            "Unlock the stance knee (~15° soft bend) and brace your core.",
            "Hinge hips straight back while keeping pelvis square to the floor (do not open the floating hip).",
            "Biceps femoris directly reinforces the lateral knee alongside the LCL."
        ],
        "avoid": "Avoid locking the knee rigidly or twisting the hip outward under fatigue.",
        "video_title": "Single Leg RDL for Hamstring & Lateral Knee Stability",
        "video_url": _yt("single leg RDL lateral knee hamstring physical therapy"),
    },
    "copenhagen_adductor_short": {
        "id": "copenhagen_adductor_short",
        "name": "Short-Lever Copenhagen Plank (Medial-Lateral Balance)",
        "region": "knee",
        "target_tissues": "Adductors & Medial Knee Counter-Stabilizers",
        "sets": 2,
        "work_sec": 25,
        "reps_label": "25s hold per side",
        "rest_sec": 25,
        "side_mode": "per_side",
        "tempo": "Isometric hold",
        "pain_ceiling": "≤ 2 / 10 (Zero sharp lateral knee pull)",
        "visual_key": "copenhagen",
        "cues": [
            "Support the top bent knee on a bench/couch (short lever keeps knee torque gentle).",
            "Lift bottom hip cleanly so torso forms a straight line, balancing medial and lateral knee forces."
        ],
        "avoid": "Use bent-knee support only — skip straight-ankle long-lever Copenhagens until LCL is 100% cleared.",
        "video_title": "Short Lever Copenhagen Adductor Plank Tutorial",
        "video_url": _yt("short lever Copenhagen plank physical therapy"),
    },
    "long_lever_bridge_iso": {
        "id": "long_lever_bridge_iso",
        "name": "Long-Lever Isometric Heel-Hook Bridge (45s Analgesic Hold)",
        "region": "calf_achilles",
        "target_tissues": "Proximal Gastrocnemius, Hamstring Tendon & Heel-Hook Chain",
        "sets": 4,
        "work_sec": 45,
        "reps_label": "45s hold (Progress double -> single leg)",
        "rest_sec": 40,
        "side_mode": "bilateral",
        "tempo": "Static isometric",
        "pain_ceiling": "≤ 3 / 10 (Pain should drop across sets)",
        "visual_key": "hamstring_bridge",
        "cues": [
            "Lie on your back with heels elevated on a bench/chair and knees bent ~30–40° (extended heel-hook angle).",
            "Dig heels gently down and lift hips 2–3 inches off the floor; hold steady for 45s.",
            "45-second isometrics reliably calm reactive proximal calf & hamstring tendinopathy before climbing."
        ],
        "avoid": "Start with both heels (or 80/20 bias) if single-leg triggers sharp upper-calf pain > 3/10.",
        "video_title": "Isometric Long Lever Hamstring & Heel Hook Bridge",
        "video_url": _yt("long lever hamstring bridge isometric tendinopathy"),
    },
    "hamstring_slider_eccentric": {
        "id": "hamstring_slider_eccentric",
        "name": "Slow Eccentric Hamstring Sliders (Extended & Close Angles)",
        "region": "hamstring",
        "target_tissues": "Medial/Lateral Hamstrings & Biarticular Gastroc Coupling",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "6–8 ultra-slow 5s slides",
        "rest_sec": 35,
        "side_mode": "bilateral",
        "tempo": "5s slide out / reset",
        "pain_ceiling": "≤ 3 / 10",
        "visual_key": "hamstring_slider",
        "cues": [
            "Place socks or sliders under heels on a smooth floor, lift hips into a bridge.",
            "Slowly extend knees over 5 full seconds until legs are nearly straight, then lower hips and pull heels back with hips down.",
            "Builds eccentric resilience across both close and extended heel-hook knee angles."
        ],
        "avoid": "Do not yank heels back with hips suspended until late Phase 3; reset on the floor first.",
        "video_title": "Eccentric Hamstring Sliders for Climber Heel Hooks",
        "video_url": _yt("eccentric hamstring sliders climbing heel hook rehab"),
    },
    "straight_knee_gastroc_hsr": {
        "id": "straight_knee_gastroc_hsr",
        "name": "Straight-Knee Heavy Slow Calf Raise (Flat Floor)",
        "region": "calf_achilles",
        "target_tissues": "Proximal & Mid Gastrocnemius Tendon (Toe-Down Strength)",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "10–12 slow reps per side",
        "rest_sec": 35,
        "side_mode": "per_side",
        "tempo": "3s up / 1s top hold / 3s down",
        "pain_ceiling": "≤ 3 / 10",
        "visual_key": "calf_raise",
        "cues": [
            "Keep the knee completely straight (targeting the biarticular gastrocnemius, not just soleus).",
            "Perform on a FLAT floor initially (skip deep heel drops over a step edge during reactive tendinitis).",
            "Slow 3-second ascent and 3-second descent rebuilds stiff tendon capacity for toeing down hard."
        ],
        "avoid": "Avoid bouncing at the bottom or dropping the heel deeply below horizontal while upper calf is sore.",
        "video_title": "E3 Rehab — Gastrocnemius Heavy Slow Resistance Calf Raise",
        "video_url": _yt("E3 Rehab gastrocnemius calf tendinopathy heavy slow resistance"),
    },
    "dynamic_posterior_chain_warmup": {
        "id": "dynamic_posterior_chain_warmup",
        "name": "Dynamic Hamstring Sweeps & Glute March Primer",
        "region": "hamstring",
        "target_tissues": "Hamstring Sliding Tissue, Sciatic Nerve Glide & Core",
        "sets": 2,
        "work_sec": 45,
        "reps_label": "12 leg swings + 12 glute marches",
        "rest_sec": 15,
        "side_mode": "per_side",
        "tempo": "Rhythmic, progressive amplitude",
        "pain_ceiling": "≤ 1 / 10 (Warm blood flow)",
        "visual_key": "leg_swing",
        "cues": [
            "Hold a wall/rack and swing leg gently forward and back, gradually increasing height over 12 reps.",
            "Follow with supine alternating glute bridge marches (keep pelvis level).",
            "Specifically fixes slow-warming hamstrings before putting feet on high footholds or heel hooks."
        ],
        "avoid": "Do not kick aggressively into a cold tight end-range stretch.",
        "video_title": "Dynamic Hamstring Warm-Up Routine Before Climbing",
        "video_url": _yt("dynamic hamstring warm up before climbing heel hooks"),
    },
    "wall_angel_scap_slide": {
        "id": "wall_angel_scap_slide",
        "name": "Thoracic Wall Angels & Scapular Upward Rotation",
        "region": "posture_mobility",
        "target_tissues": "Lower Traps, Serratus Anterior & Thoracic Spine",
        "sets": 3,
        "work_sec": 40,
        "reps_label": "10 slow wall slides",
        "rest_sec": 20,
        "side_mode": "bilateral",
        "tempo": "3s reach up / 3s pull down",
        "pain_ceiling": "0–1 / 10",
        "visual_key": "wall_angel",
        "cues": [
            "Stand with heels 3 inches from a wall; tuck ribs down so lower back stays flat against the wall.",
            "Press backs of hands and elbows gently into the wall as you slide arms into a Y-shape.",
            "Counters desk/climber rounded-shoulder posture and boosts overhead reach efficiency."
        ],
        "avoid": "Do not flare ribs off the wall to fake extra overhead shoulder range.",
        "video_title": "Thoracic Wall Angels for Climber Posture & Shoulder Mobility",
        "video_url": _yt("wall angels climber posture shoulder mobility"),
    },
    "frog_hip_turnout_rock": {
        "id": "frog_hip_turnout_rock",
        "name": "Frog Hip Turnout & Adductor Mobility Rocks",
        "region": "posture_mobility",
        "target_tissues": "Hip Capsule, Adductors & External Turnout (Protects LCL)",
        "sets": 3,
        "work_sec": 45,
        "reps_label": "10 gentle rocks + 15s end hold",
        "rest_sec": 20,
        "side_mode": "bilateral",
        "tempo": "3s rock back / exhale",
        "pain_ceiling": "≤ 2 / 10 (Stretch only, zero knee torque)",
        "visual_key": "frog_stretch",
        "cues": [
            "Kneel wide on a padded mat with shins parallel and ankles relaxed outward.",
            "Gently rock hips straight back toward your heels while keeping spine neutral.",
            "Greater hip turnout keeps your knees closer to the wall without twisting your right knee LCL."
        ],
        "avoid": "Keep knees padded and skip if lateral knee feels any varus/rotational pinch.",
        "video_title": "Frog Stretch Hip Mobility for Rock Climbing Turnout",
        "video_url": _yt("frog stretch hip mobility for rock climbing"),
    },
    "knee_to_wall_ankle_mob": {
        "id": "knee_to_wall_ankle_mob",
        "name": "Knee-to-Wall Ankle Dorsiflexion Mobilization",
        "region": "posture_mobility",
        "target_tissues": "Talocrural Joint & Soleus Flexibility",
        "sets": 2,
        "work_sec": 40,
        "reps_label": "12 slow pulses per ankle",
        "rest_sec": 15,
        "side_mode": "per_side",
        "tempo": "2s forward / 2s return",
        "pain_ceiling": "≤ 1 / 10",
        "visual_key": "ankle_wall",
        "cues": [
            "Place toes 3–4 inches from a wall, keep the heel glued completely to the floor.",
            "Drive the knee directly over the 2nd toe to tap the wall without letting the arch collapse.",
            "Symmetric ankle mobility unloads both the upper calf and 1st MTP big toe joint."
        ],
        "avoid": "Do not push into an anterior ankle pinch or lift your heel off the floor.",
        "video_title": "Knee to Wall Ankle Dorsiflexion Mobility Test & Drill",
        "video_url": _yt("knee to wall ankle dorsiflexion mobilization"),
    },
    "open_book_thoracic": {
        "id": "open_book_thoracic",
        "name": "Side-Lying Open-Book Thoracic Rotation",
        "region": "posture_mobility",
        "target_tissues": "Thoracic Spine & Posterior Shoulder Capsule",
        "sets": 2,
        "work_sec": 40,
        "reps_label": "8 slow rotations per side",
        "rest_sec": 15,
        "side_mode": "per_side",
        "tempo": "3s open + deep exhale",
        "pain_ceiling": "0–1 / 10",
        "visual_key": "open_book",
        "cues": [
            "Lie on your side with the top knee resting on a foam roller or block at 90° hip flexion.",
            "Keep the top knee pinned down while rotating your upper chest and arm open toward the floor behind you.",
            "Improves twist-lock reach and reduces lower-back/knee compensation on steep walls."
        ],
        "avoid": "Do not let the top knee lift off the block — rotation should come from the upper back.",
        "video_title": "Open Book Thoracic Rotation Mobility Drill",
        "video_url": _yt("open book thoracic rotation mobility exercise"),
    },
}


PROTOCOLS = {
    "finger_pulley_rehab": {
        "id": "finger_pulley_rehab",
        "title": "Finger Pulley & Long-Finger Lever Rehab",
        "subtitle": "Synovial gliding, open-hand collagen remodeling & extensor balance (NO closed crimping)",
        "region": "fingers",
        "est_minutes": 14,
        "exercise_ids": ["finger_h_tape_check", "tendon_glides", "open_hand_density_hang", "extensor_rice_bucket"],
    },
    "big_toe_turf_toe": {
        "id": "big_toe_turf_toe",
        "title": "Great Toe (1st MTP) Sprain & Intrinsic Foot Rehab",
        "subtitle": "Extension protection, pain-free capsule glides, Toe Yoga & arch doming",
        "region": "toe_foot",
        "est_minutes": 14,
        "exercise_ids": ["turf_toe_tape_setup", "great_toe_rom_glides", "toe_yoga_isolation", "short_foot_doming", "progressive_heel_raise_toe"],
    },
    "knee_lcl_strength": {
        "id": "knee_lcl_strength",
        "title": "Knee LCL & Lateral Stabilizer Rebuild",
        "subtitle": "Glute medius, quad/hamstring co-contraction, lateral step-downs & hip turnout",
        "region": "knee",
        "est_minutes": 18,
        "exercise_ids": ["banded_clamshell_iso", "spanish_squat_iso", "lateral_step_down_eccentric", "single_leg_rdl_reach", "copenhagen_adductor_short"],
    },
    "upper_calf_heel_hook": {
        "id": "upper_calf_heel_hook",
        "title": "Upper Calf (Proximal Gastroc) & Heel-Hook Conditioning",
        "subtitle": "45s analgesic heel-hook bridges, straight-knee flat-floor HSR & ankle mobility",
        "region": "calf_achilles",
        "est_minutes": 16,
        "exercise_ids": ["dynamic_posterior_chain_warmup", "long_lever_bridge_iso", "straight_knee_gastroc_hsr", "knee_to_wall_ankle_mob"],
    },
    "hamstring_warmup_eccentric": {
        "id": "hamstring_warmup_eccentric",
        "title": "Slow-Warming Hamstring & Posterior Chain Primer",
        "subtitle": "Progressive dynamic blood flow, isometric bridges & 5-second eccentric sliders",
        "region": "hamstring",
        "est_minutes": 15,
        "exercise_ids": ["dynamic_posterior_chain_warmup", "long_lever_bridge_iso", "hamstring_slider_eccentric", "single_leg_rdl_reach"],
    },
    "pre_climb_warmup": {
        "id": "pre_climb_warmup",
        "title": "10-Min Pre-Climb Full-Chain Primer",
        "subtitle": "Mandatory warm-up for slow posterior chain, ankles, hips & finger tendons before pulling hard",
        "region": "full_body",
        "est_minutes": 11,
        "exercise_ids": ["dynamic_posterior_chain_warmup", "long_lever_bridge_iso", "frog_hip_turnout_rock", "tendon_glides", "toe_yoga_isolation"],
    },
    "posture_mobility_flow": {
        "id": "posture_mobility_flow",
        "title": "Climber's Posture, Hip Turnout & Mobility Flow",
        "subtitle": "Thoracic extension, hip external rotation (protects LCL) & ankle dorsiflexion symmetry",
        "region": "posture_mobility",
        "est_minutes": 12,
        "exercise_ids": ["wall_angel_scap_slide", "open_book_thoracic", "frog_hip_turnout_rock", "knee_to_wall_ankle_mob"],
    },
    "achilles_calf_hsr": {
        "id": "achilles_calf_hsr",
        "title": "Achilles & Calf Heavy Slow Resistance",
        "subtitle": "Isometric tendon analgesia + controlled straight-knee HSR loading",
        "region": "calf_achilles",
        "est_minutes": 14,
        "exercise_ids": ["dynamic_posterior_chain_warmup", "straight_knee_gastroc_hsr", "knee_to_wall_ankle_mob", "short_foot_doming"],
    },
    "knee_itb_hip_strength": {
        "id": "knee_itb_hip_strength",
        "title": "Lateral Knee & Hip Control Progression",
        "subtitle": "Glute medius activation, Spanish squat isometrics & aligned step-downs",
        "region": "knee",
        "est_minutes": 15,
        "exercise_ids": ["banded_clamshell_iso", "spanish_squat_iso", "lateral_step_down_eccentric", "single_leg_rdl_reach"],
    },
}


PROTOCOL_ROADMAPS = {
    "fingers": [
        {"phase": "acute", "label": "Phase 1: Calm & De-Load (Days 1–7)", "goal": "Pain-free 3-position tendon glides, H-taping awareness, zero crimping."},
        {"phase": "subacute", "label": "Phase 2: Sub-Max Open-Hand (Weeks 1–3)", "goal": "20mm open-hand / 3-finger drag density holds (30–50% load), pain ≤ 2/10, extensor balance."},
        {"phase": "strengthening", "label": "Phase 3: Graded Half-Crimp (Weeks 3–6)", "goal": "Reintroduce open/half-crimp on large holds if morning stiffness is ≤ 1/10 and palpation improves."},
        {"phase": "return_to_sport", "label": "Phase 4: Performance Maintenance", "goal": "Full repertoire with mandatory 10-min progressive finger warm-up and long-finger grip awareness."},
    ],
    "toe_foot": [
        {"phase": "acute", "label": "Phase 1: Protect Hyperextension (Days 1–7)", "goal": "Figure-8 turf-toe taping, stiff-soled shoe, pain-free active ROM glides only."},
        {"phase": "subacute", "label": "Phase 2: Intrinsic Control (Weeks 1–3)", "goal": "Toe yoga isolation + short-foot arch doming + flat-floor partial heel raises (≤ 2/10)."},
        {"phase": "strengthening", "label": "Phase 3: Edging & Push-Off Load (Weeks 3–6)", "goal": "Single-leg heel raises and progressive edging on medium holds without downturn hyperextension."},
        {"phase": "return_to_sport", "label": "Phase 4: Full Footwork", "goal": "Aggressive edging, toe hooks, and dynamic smearing cleared with ≤ 1/10 next-day stiffness."},
    ],
    "knee": [
        {"phase": "acute", "label": "Phase 1: Unload Varus Torque (Days 1–5)", "goal": "Avoid deep drop-knees and twisting heel hooks; gentle isometric quad/hip sets."},
        {"phase": "subacute", "label": "Phase 2: Co-Contraction (Weeks 1–2)", "goal": "Banded clamshells + Spanish squat / wall sit isometrics to stabilize joint line."},
        {"phase": "strengthening", "label": "Phase 3: Eccentric & Hip Turnout (Weeks 2–5)", "goal": "3s eccentric lateral step-downs, single-leg RDL (biceps femoris), and frog hip turnout mobility."},
        {"phase": "return_to_sport", "label": "Phase 4: Drop-Knee & Heel-Hook Clearance", "goal": "Controlled drop-knees initiated from hip rotation rather than knee varus torque."},
    ],
    "calf_achilles": [
        {"phase": "acute", "label": "Phase 1: Tendon Analgesia (Days 1–7)", "goal": "Pause painful max heel hooks & hard toe-downs; 45s isometric holds to calm tendon."},
        {"phase": "subacute", "label": "Phase 2: Heavy Slow Resistance (Weeks 1–4)", "goal": "Flat-floor straight-knee gastroc HSR (3s up/down) + long-lever bridges at ≤ 3/10 pain."},
        {"phase": "strengthening", "label": "Phase 3: Angle-Specific Hook Load (Weeks 4–7)", "goal": "Progress isometric & eccentric bridge angles from extended to close knee flexion."},
        {"phase": "return_to_sport", "label": "Phase 4: Full Heel-Hook & Toe-Down Power", "goal": "Hard toe-down pulls and maximal heel hooks cleared after 10-min posterior chain warm-up."},
    ],
    "hamstring": [
        {"phase": "acute", "label": "Phase 1: Gentle Sliding & Warmth (Days 1–5)", "goal": "Dynamic leg swings + light glute marches; avoid cold ballistic stretching."},
        {"phase": "subacute", "label": "Phase 2: Isometric Priming (Weeks 1–3)", "goal": "Mandatory 10-min pre-climb primer + 45s long-lever bridges before any heel hooking."},
        {"phase": "strengthening", "label": "Phase 3: Eccentric Resilience (Weeks 3–6)", "goal": "5s slow eccentric sliders across extended and close knee angles + single-leg RDL."},
        {"phase": "return_to_sport", "label": "Phase 4: Symmetric Warm-Up & Power", "goal": "Left/Right ASLR & bridge hold symmetry within 10%; fast warm-up readiness."},
    ],
}


ASSESSMENT_CATALOG = [
    {
        "id": "ankle_dorsiflexion",
        "name": "Knee-to-Wall Ankle Dorsiflexion",
        "region": "Ankle & Calf",
        "unit": "cm",
        "direction": "higher_better",
        "target_min": 10.0,
        "target_label": "≥ 10 cm & < 10% L/R gap",
        "how_to": "Place toes facing a wall, keep heel flat on floor, and lunge knee straight over 2nd toe to touch wall. Measure max toe-to-wall distance.",
        "visual_key": "ankle_wall",
        "why_climber": "Restricted ankle mobility forces excessive pronation onto the big toe and overloads the upper calf during stemming and high steps.",
        "recommended_exercises": ["knee_to_wall_ankle_mob", "straight_knee_gastroc_hsr"],
    },
    {
        "id": "hamstring_aslr",
        "name": "Active Straight-Leg Raise (Hamstring)",
        "region": "Posterior Chain",
        "unit": "deg",
        "direction": "higher_better",
        "target_min": 75.0,
        "target_label": "≥ 75° & < 10% L/R gap",
        "how_to": "Lie flat on back, keep non-working leg pinned straight on the floor, and actively raise working straight leg up. Estimate angle (degrees).",
        "visual_key": "leg_swing",
        "why_climber": "Exposes Left vs. Right posterior-chain stiffness behind slow warm-ups and proximal calf overload on extended heel hooks.",
        "recommended_exercises": ["dynamic_posterior_chain_warmup", "hamstring_slider_eccentric"],
    },
    {
        "id": "hip_turnout_frog",
        "name": "Seated Hip External Rotation / Turnout",
        "region": "Hip & Knee Protection",
        "unit": "deg",
        "direction": "higher_better",
        "target_min": 45.0,
        "target_label": "≥ 45° symmetric turnout",
        "how_to": "Sit upright at edge of bench with knees at 90°; rotate lower leg inward (external hip rotation) without leaning torso. Estimate angle.",
        "visual_key": "frog_stretch",
        "why_climber": "Limited hip external rotation transfers twisting varus stress directly into the knee LCL during drop-knees and high frogs.",
        "recommended_exercises": ["frog_hip_turnout_rock", "banded_clamshell_iso"],
    },
    {
        "id": "single_leg_calf_raise",
        "name": "Single-Leg Straight-Knee Calf Endurance",
        "region": "Upper Calf & Big Toe",
        "unit": "reps",
        "direction": "higher_better",
        "target_min": 25.0,
        "target_label": "≥ 25 clean reps (pain ≤ 2/10)",
        "how_to": "Fingertips on wall for balance, straight knee, flat floor. Perform full controlled raises (1s up / 1s down) until form breaks or pain > 2/10.",
        "visual_key": "calf_raise",
        "why_climber": "Gold-standard benchmark for gastrocnemius-Achilles capacity on toe-downs and big-toe push-off endurance.",
        "recommended_exercises": ["straight_knee_gastroc_hsr", "progressive_heel_raise_toe"],
    },
    {
        "id": "single_leg_bridge_hold",
        "name": "Long-Lever Single-Leg Bridge Hold",
        "region": "Heel Hook & Hamstring",
        "unit": "sec",
        "direction": "higher_better",
        "target_min": 45.0,
        "target_label": "≥ 45s hold (< 10% L/R gap)",
        "how_to": "Heel propped on low bench with ~35° knee bend (heel-hook position). Lift hips 2 inches and time crisp hold without cramping or > 2/10 pain.",
        "visual_key": "hamstring_bridge",
        "why_climber": "Tests isometric hamstring + proximal gastroc endurance directly in your heel-hook angle.",
        "recommended_exercises": ["long_lever_bridge_iso", "hamstring_slider_eccentric"],
    },
    {
        "id": "lateral_step_down",
        "name": "Lateral Step-Down Alignment Score",
        "region": "Knee LCL & Hip Control",
        "unit": "score",
        "direction": "higher_better",
        "target_min": 4.0,
        "target_label": "≥ 4 / 5 clean control",
        "how_to": "From 6-inch step, lower opposite heel slowly in 3s. Score 1–5: 5 = steady pelvis & knee aligned over 2nd toe; 3 = mild wobble; 1 = collapse/pain.",
        "visual_key": "step_down",
        "why_climber": "Reveals lateral hip drop or knee varus/valgus wobble that predisposes the LCL to re-sprains.",
        "recommended_exercises": ["lateral_step_down_eccentric", "banded_clamshell_iso", "spanish_squat_iso"],
    },
    {
        "id": "shoulder_wall_angel",
        "name": "Wall Angel Wrist-to-Wall Posture Gap",
        "region": "Thoracic & Shoulder Posture",
        "unit": "cm",
        "direction": "lower_better",
        "target_max": 2.0,
        "target_label": "≤ 2 cm gap (0 cm = flush)",
        "how_to": "Stand with heels 3 in from wall, ribs/low back flat against wall, raise arms to 90/90 goalpost. Measure wrist distance from wall (0 cm = ideal).",
        "visual_key": "wall_angel",
        "why_climber": "Measures thoracic stiffness & anterior shoulder tightness from desk work + heavy pulling.",
        "recommended_exercises": ["wall_angel_scap_slide", "open_book_thoracic"],
    },
    {
        "id": "finger_no_hang_tolerance",
        "name": "20mm Open-Hand Pain-Free Load",
        "region": "Fingers & Pulleys",
        "unit": "lbs",
        "direction": "higher_better",
        "target_min": 65.0,
        "target_label": "< 10% L/R gap (pain ≤ 2/10)",
        "how_to": "Using a portable 20mm edge + loading pin/scale in open-hand drag, record max load held cleanly for 10s at ≤ 2/10 discomfort.",
        "visual_key": "open_hand_edge",
        "why_climber": "Quantifies objective finger pulley recovery week-over-week without risking full bodyweight crimps.",
        "recommended_exercises": ["open_hand_density_hang", "tendon_glides", "extensor_rice_bucket"],
    },
]


def _default_climbing_mods(region):
    mods = {
        "fingers": "Open-hand / 3-finger drag only; avoid closed crimps and high-torque side-pulls.",
        "toe_foot": "Use flat stiff-soled shoe; avoid aggressive edging or hyperextension push-offs.",
        "knee": "Skip deep drop-knees and twisting heel hooks; keep hips turned out.",
        "calf_achilles": "Limit max extended/close heel hooks and hard toe-downs; warm up 10+ min first.",
        "hamstring": "Complete 10-min posterior-chain warm-up before attempting any heel hooks.",
    }
    return mods.get(region, "Keep load controlled at ≤ 2–3/10 pain; prioritize quality movement.")


def compute_injury_triage(injury, latest_log, prev_log=None):
    """Traffic-light daily triage engine from pain, morning stiffness, swelling, and 24h delta."""
    phase = (injury.get("phase") or "subacute").lower()
    region = injury.get("body_region") or "full_body"
    custom_mod = injury.get("climbing_modifications") or _default_climbing_mods(region)

    if latest_log:
        p_rest = int(latest_log.get("pain_rest") or 0)
        p_load = int(latest_log.get("pain_load") or 0)
        stiff = int(latest_log.get("morning_stiffness") or 0)
        swell = int(latest_log.get("swelling") or 0)
    else:
        # Sensible phase defaults before first check-in
        p_rest = 1 if phase == "acute" else 0
        p_load = 4 if phase == "acute" else (2 if phase == "subacute" else 1)
        stiff = 3 if phase == "acute" else 2
        swell = 1 if phase == "acute" else 0

    pain_delta = None
    stiff_delta = 0
    if latest_log and prev_log:
        pain_delta = p_load - int(prev_log.get("pain_load") or 0)
        stiff_delta = stiff - int(prev_log.get("morning_stiffness") or 0)

    flare_24h = (pain_delta is not None and pain_delta >= 2) or stiff_delta >= 2

    if p_rest >= 4 or p_load >= 6 or swell >= 2 or flare_24h:
        color = "red"
        readiness = "Rest / Protect (Hold Wall Load)"
        clearance = "Pause provocative climbing moves for this region today. Stick to gentle pain-free ROM, protection/taping, and 45s analgesic isometrics if tolerated (≤ 2/10)."
        load_note = "De-load 50–100%: focus on circulation, taping, and upper/opposite-limb work."
        dos = [
            "Perform pain-free ROM glides (0–1/10 pain) and gentle blood-flow warm-up.",
            "Apply protective taping or stiff footwear as indicated.",
            "Re-check morning stiffness tomorrow — look for stiffness trending down.",
        ]
        donts = [
            "Do NOT climb on provocative grips/footholds or test max strength today.",
            "Do NOT push through pain > 2/10 or ignore swelling.",
        ]
    elif phase == "acute" or p_load >= 3 or stiff >= 3 or swell == 1:
        color = "amber"
        readiness = "Modified Climb + Targeted Rehab"
        clearance = custom_mod
        load_note = "Sub-max controlled rehab (≤ 2–3/10 pain during reps; must settle back to baseline within 24h)."
        dos = [
            "Complete 10-min pre-climb warm-up before touching steep or tricky holds.",
            custom_mod,
            "Complete today's guided rehab protocol at controlled tempo.",
        ]
        donts = [
            "Avoid max-effort project moves or sudden dynamic catches on this tissue.",
            "Stop any exercise or boulder problem if pain rises above 3/10.",
        ]
    else:
        color = "green"
        readiness = "Cleared for Graded Loading"
        clearance = "Cleared for normal progressive climbing and Phase 3/4 strengthening while keeping warm-up discipline."
        load_note = "Progress load gradually (+10–15% per week) while guarding L/R symmetry."
        dos = [
            "Maintain 10-min full-chain warm-up before hard climbing.",
            "Build eccentric & isometric strength via today's progressive exercises.",
        ]
        donts = [
            "Avoid skipping warm-up even on green days — prevent relapse.",
            "Avoid sudden spikes in volume or maximal closed-crimp/drop-knee sessions back-to-back.",
        ]

    return {
        "status_color": color,
        "readiness_label": readiness,
        "climbing_clearance": clearance,
        "load_scale_note": load_note,
        "dos": dos,
        "donts": donts,
        "pain_rest": p_rest,
        "pain_load": p_load,
        "morning_stiffness": stiff,
        "swelling": swell,
        "pain_delta_24h": pain_delta,
    }


def ensure_rehab_seeded(conn=None):
    """Auto-seed initial injuries (and baseline logs) for the active mode if empty."""
    owns_conn = conn is None
    if owns_conn:
        conn = get_connection()
    _ensure_rehab_tables(conn)

    is_demo_val = 1 if _is_demo_mode() else 0
    cnt = conn.execute(
        "SELECT COUNT(*) AS cnt FROM rehab_injuries WHERE is_demo = ?",
        (is_demo_val,),
    ).fetchone()["cnt"]

    if cnt == 0:
        rp = get_rehab_profile()
        for inj in rp.get("seed_injuries") or []:
            conn.execute(
                """
                INSERT OR IGNORE INTO rehab_injuries
                (id, title, body_region, side, tissue_type, suspected_grade, phase, status,
                 onset_date, mechanism, symptoms, anatomy_note, climbing_modifications,
                 red_flags, protocol_id, notes, updated_at, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
                """,
                (
                    inj.get("id"),
                    inj.get("title", "Injury"),
                    inj.get("body_region", "full_body"),
                    inj.get("side", "bilateral"),
                    inj.get("tissue_type", "tendon"),
                    inj.get("suspected_grade", "Grade 1"),
                    inj.get("phase", "subacute"),
                    inj.get("status", "active"),
                    inj.get("onset_date", ""),
                    inj.get("mechanism", ""),
                    inj.get("symptoms", ""),
                    inj.get("anatomy_note", ""),
                    inj.get("climbing_modifications", ""),
                    inj.get("red_flags", ""),
                    inj.get("protocol_id", "pre_climb_warmup"),
                    inj.get("notes", ""),
                    is_demo_val,
                ),
            )
        for lg in rp.get("seed_logs") or []:
            conn.execute(
                """
                INSERT OR IGNORE INTO rehab_daily_logs
                (log_date, injury_id, pain_rest, pain_load, morning_stiffness, swelling,
                 warmup_minutes, climbed_today, session_rpe, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lg.get("log_date") or datetime.now().strftime("%Y-%m-%d"),
                    lg.get("injury_id"),
                    int(lg.get("pain_rest") or 0),
                    int(lg.get("pain_load") or 0),
                    int(lg.get("morning_stiffness") or 0),
                    int(lg.get("swelling") or 0),
                    int(lg.get("warmup_minutes") or 0),
                    int(lg.get("climbed_today") or 0),
                    int(lg.get("session_rpe") or 0),
                    lg.get("notes", ""),
                ),
            )
        conn.commit()
    if owns_conn:
        conn.close()


def _hydrate_protocol(proto_id, triage_map=None):
    proto = PROTOCOLS.get(proto_id)
    if not proto:
        return None
    ex_list = []
    est_sec = 0
    for ex_id in proto.get("exercise_ids") or []:
        ex = dict(EXERCISES.get(ex_id) or {})
        if not ex:
            continue
        sets = int(ex.get("sets") or 1)
        work = int(ex.get("work_sec") or 30)
        rest = int(ex.get("rest_sec") or 15)
        sides = 2 if ex.get("side_mode") == "per_side" else 1
        est_sec += sets * ((work * sides) + rest)
        ex_list.append(ex)
    return {
        **proto,
        "est_minutes": max(1, round(est_sec / 60.0)),
        "exercises": ex_list,
    }


def _build_adaptive_today_protocol(enriched_injuries):
    """Assemble today's prioritized rehab sequence based on active injuries and triage colors."""
    active = [i for i in enriched_injuries if i.get("status") == "active"]
    rank = {"red": 0, "amber": 1, "green": 2}
    active_sorted = sorted(
        active,
        key=lambda x: (rank.get(x["triage"]["status_color"], 1), -x["triage"]["pain_load"]),
    )

    chosen_ids = []
    seen = set()

    def _add_ex(ex_id, injury_ref=None):
        if ex_id in seen or ex_id not in EXERCISES:
            return
        seen.add(ex_id)
        ex = dict(EXERCISES[ex_id])
        if injury_ref:
            ex["linked_injury"] = injury_ref.get("title")
            ex["linked_triage"] = injury_ref["triage"]["status_color"]
            if injury_ref["triage"]["status_color"] == "red":
                ex["sets"] = max(1, int(ex.get("sets") or 2) - 1)
                ex["coaching_note"] = "Red triage today — keep load ultra-gentle (≤ 1–2/10 pain)."
        chosen_ids.append((ex_id, ex))

    # 1. Start with slow posterior-chain primer if hamstring/calf active
    if any(i.get("body_region") in ("hamstring", "calf_achilles") for i in active_sorted):
        _add_ex("dynamic_posterior_chain_warmup")

    # 2. Pick top 1–2 most protective/highest-value drills per active injury (cap ~7 steps)
    for inj in active_sorted:
        color = inj["triage"]["status_color"]
        pid = inj.get("protocol_id") or ""
        p_def = PROTOCOLS.get(pid)
        if not p_def:
            continue
        p_exs = p_def.get("exercise_ids") or []
        if color == "red":
            # Only first 1-2 lowest-load protective / ROM exercises
            for ex_id in p_exs[:2]:
                _add_ex(ex_id, inj)
        elif color == "amber":
            # Skip already-added warmup, take first 2 targeted exercises
            added_for_inj = 0
            for ex_id in p_exs:
                if ex_id == "dynamic_posterior_chain_warmup":
                    continue
                _add_ex(ex_id, inj)
                added_for_inj += 1
                if added_for_inj >= 2:
                    break
        else:
            # Green: pick strengthening exercise (later in protocol)
            for ex_id in reversed(p_exs):
                if ex_id != "dynamic_posterior_chain_warmup":
                    _add_ex(ex_id, inj)
                    break

    # 3. Always include hip turnout if knee is active (prevents drop-knee varus torque)
    if any(i.get("body_region") == "knee" for i in active_sorted) and len(chosen_ids) < 8:
        _add_ex("frog_hip_turnout_rock")

    if not chosen_ids:
        for ex_id in PROTOCOLS["posture_mobility_flow"]["exercise_ids"]:
            _add_ex(ex_id)

    ex_list = [item[1] for item in chosen_ids[:8]]
    est_sec = 0
    for ex in ex_list:
        sets = int(ex.get("sets") or 1)
        work = int(ex.get("work_sec") or 30)
        rest = int(ex.get("rest_sec") or 15)
        sides = 2 if ex.get("side_mode") == "per_side" else 1
        est_sec += sets * ((work * sides) + rest)

    return {
        "id": "adaptive_today",
        "title": "Today's Adaptive PT Session",
        "subtitle": "Automatically prioritized from your active injuries & latest daily check-in triage.",
        "region": "adaptive",
        "est_minutes": max(1, round(est_sec / 60.0)),
        "exercises": ex_list,
    }


def _evaluate_assessment(test_def, latest_row):
    if not latest_row:
        return {
            "status": "untested",
            "status_label": "Not Tested Yet",
            "asymmetry_pct": None,
            "weak_side": None,
        }
    l_val = latest_row.get("left_val")
    r_val = latest_row.get("right_val")
    b_val = latest_row.get("bilateral_val")
    direction = test_def.get("direction", "higher_better")

    asym = None
    weak_side = "balanced"
    if l_val is not None and r_val is not None and max(abs(l_val), abs(r_val)) > 0:
        asym = round(abs(l_val - r_val) / max(abs(l_val), abs(r_val)) * 100.0, 1)
        if asym >= 5.0:
            if direction == "higher_better":
                weak_side = "left" if l_val < r_val else "right"
            else:
                weak_side = "left" if l_val > r_val else "right"

    vals = [v for v in (l_val, r_val, b_val) if v is not None]
    if not vals:
        return {"status": "untested", "status_label": "Not Tested Yet", "asymmetry_pct": None, "weak_side": None}

    below_target = False
    if direction == "higher_better":
        t_min = float(test_def.get("target_min") or 0.0)
        below_target = min(vals) < t_min
    else:
        t_max = float(test_def.get("target_max") or 999.0)
        below_target = max(vals) > t_max

    if (asym is not None and asym >= 15.0) or (below_target and asym is not None and asym >= 10.0):
        status, label = "priority_gap", "Priority Weak Link"
    elif below_target or (asym is not None and asym >= 10.0):
        status, label = "watch", "Watch / Improve"
    else:
        status, label = "optimal", "Optimal & Balanced"

    return {
        "status": status,
        "status_label": label,
        "asymmetry_pct": asym,
        "weak_side": weak_side,
    }


def build_rehab_dashboard():
    """Return full rehab coach state: injuries, daily triage, adaptive workout, protocols & diagnostics."""
    conn = get_connection()
    ensure_rehab_seeded(conn)
    is_demo_val = 1 if _is_demo_mode() else 0

    inj_rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM rehab_injuries WHERE is_demo = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'monitoring' THEN 1 ELSE 2 END, id ASC",
            (is_demo_val,),
        ).fetchall()
    ]

    inj_ids = [r["id"] for r in inj_rows]
    logs_by_inj = {iid: [] for iid in inj_ids}
    if inj_ids:
        placeholders = ",".join("?" for _ in inj_ids)
        log_rows = conn.execute(
            f"SELECT * FROM rehab_daily_logs WHERE injury_id IN ({placeholders}) ORDER BY log_date DESC, id DESC",
            inj_ids,
        ).fetchall()
        for lr in log_rows:
            d = dict(lr)
            logs_by_inj.setdefault(d["injury_id"], []).append(d)

    sessions = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM rehab_workout_sessions ORDER BY session_date DESC, id DESC LIMIT 40"
        ).fetchall()
    ]

    assess_rows = [
        dict(r)
        for r in conn.execute(
            "SELECT * FROM rehab_assessments ORDER BY assessed_date DESC, id DESC LIMIT 120"
        ).fetchall()
    ]
    conn.close()

    enriched_injuries = []
    for inj in inj_rows:
        hist = logs_by_inj.get(inj["id"], [])
        latest = hist[0] if hist else None
        prev = hist[1] if len(hist) > 1 else None
        triage = compute_injury_triage(inj, latest, prev)
        roadmap = PROTOCOL_ROADMAPS.get(inj.get("body_region"), PROTOCOL_ROADMAPS["knee"])
        enriched_injuries.append({
            **inj,
            "triage": triage,
            "latest_log": latest,
            "logs_history": list(reversed(hist[:30])),
            "roadmap": roadmap,
        })

    active_injs = [i for i in enriched_injuries if i.get("status") == "active"]
    colors = [i["triage"]["status_color"] for i in active_injs]
    if "red" in colors:
        overall_color = "red"
        overall_label = "Caution — De-Load Red Regions Today"
    elif "amber" in colors:
        overall_color = "amber"
        overall_label = "Modified Climbing + Guided Rehab"
    else:
        overall_color = "green"
        overall_label = "Cleared for Progressive Training"

    today_workout = _build_adaptive_today_protocol(enriched_injuries)

    hydrated_protocols = [today_workout]
    for pid in PROTOCOLS:
        hp = _hydrate_protocol(pid)
        if hp:
            hydrated_protocols.append(hp)

    # Assessments enriched with latest scores & priority gaps
    latest_assess_by_test = {}
    history_by_test = {}
    for ar in assess_rows:
        tid = ar["test_id"]
        history_by_test.setdefault(tid, []).append(ar)
        if tid not in latest_assess_by_test:
            latest_assess_by_test[tid] = ar

    enriched_assessments = []
    priority_gaps = []
    tested_count = 0
    max_asym = 0.0
    for td in ASSESSMENT_CATALOG:
        latest_a = latest_assess_by_test.get(td["id"])
        eval_res = _evaluate_assessment(td, latest_a)
        if latest_a:
            tested_count += 1
        if eval_res["asymmetry_pct"] is not None:
            max_asym = max(max_asym, eval_res["asymmetry_pct"])
        item = {
            **td,
            "latest": latest_a,
            "history": list(reversed(history_by_test.get(td["id"], [])[:12])),
            "evaluation": eval_res,
        }
        enriched_assessments.append(item)
        if eval_res["status"] in ("priority_gap", "watch"):
            priority_gaps.append({
                "test_id": td["id"],
                "name": td["name"],
                "status": eval_res["status"],
                "status_label": eval_res["status_label"],
                "asymmetry_pct": eval_res["asymmetry_pct"],
                "weak_side": eval_res["weak_side"],
                "recommended_exercises": td["recommended_exercises"],
            })

    rp = get_rehab_profile()
    athlete_profile = rp.get("athlete_profile") or {
        "sport": "Climbing & Strength Training",
        "anatomy_summary": "General climbing injury monitoring and progressive load management.",
        "long_warmup_notes": "Perform 10 minutes of dynamic and isometric priming before maximal efforts.",
        "session_frequency": "5–6 Days/Wk",
    }

    wall_rules = []
    for inj in active_injs:
        wall_rules.append({
            "injury_id": inj["id"],
            "title": inj["title"],
            "status_color": inj["triage"]["status_color"],
            "rule": inj["triage"]["climbing_clearance"],
        })

    # Combined chronological timeline
    timeline = []
    for s in sessions[:20]:
        timeline.append({
            "kind": "workout",
            "date": s["session_date"],
            "title": "Completed {0}".format(s["protocol_title"]),
            "detail": "{0}/{1} steps • {2} min • Post-pain {3}/10".format(
                s["exercises_completed"], s["total_exercises"], round(s["duration_sec"] / 60.0, 1), s["post_pain"]
            ),
            "notes": s.get("notes") or "",
        })
    for inj in enriched_injuries:
        for lg in reversed(inj["logs_history"][-8:]):
            timeline.append({
                "kind": "checkin",
                "date": lg["log_date"],
                "title": "Check-In: {0}".format(inj["title"]),
                "detail": "Rest {0}/10 • Load {1}/10 • Morning Stiff {2}/10 • Swell {3}/3".format(
                    lg["pain_rest"], lg["pain_load"], lg["morning_stiffness"], lg["swelling"]
                ),
                "notes": lg.get("notes") or "",
            })
    for ar in assess_rows[:15]:
        t_name = next((t["name"] for t in ASSESSMENT_CATALOG if t["id"] == ar["test_id"]), ar["test_id"])
        timeline.append({
            "kind": "assessment",
            "date": ar["assessed_date"],
            "title": "Screen: {0}".format(t_name),
            "detail": "L: {0} / R: {1} {2}".format(
                ar["left_val"] if ar["left_val"] is not None else "—",
                ar["right_val"] if ar["right_val"] is not None else "—",
                ar.get("unit") or "",
            ).strip(),
            "notes": ar.get("notes") or "",
        })
    timeline.sort(key=lambda x: x["date"], reverse=True)

    return {
        "mode": "demo" if _is_demo_mode() else "private",
        "clinical_disclaimer": CLINICAL_DISCLAIMER,
        "athlete_profile": athlete_profile,
        "overall_readiness": {
            "status_color": overall_color,
            "label": overall_label,
            "active_count": len(active_injs),
            "red_count": colors.count("red"),
            "amber_count": colors.count("amber"),
            "green_count": colors.count("green"),
        },
        "climbing_wall_rules": wall_rules,
        "injuries": enriched_injuries,
        "today_workout": today_workout,
        "protocols": hydrated_protocols,
        "exercises": EXERCISES,
        "assessments": {
            "catalog": enriched_assessments,
            "tested_count": tested_count,
            "total_tests": len(ASSESSMENT_CATALOG),
            "max_asymmetry_pct": round(max_asym, 1),
            "priority_gaps": priority_gaps,
        },
        "workout_sessions": sessions,
        "timeline": timeline[:40],
    }


def upsert_daily_checkin(payload):
    injury_id = str(payload.get("injury_id") or "").strip()
    if not injury_id:
        raise ValueError("injury_id is required")
    log_date = str(payload.get("log_date") or datetime.now().strftime("%Y-%m-%d")).strip()

    def _clamp(val, lo, hi):
        return max(lo, min(hi, int(val or 0)))

    conn = get_connection()
    ensure_rehab_seeded(conn)
    conn.execute(
        """
        INSERT INTO rehab_daily_logs
        (log_date, injury_id, pain_rest, pain_load, morning_stiffness, swelling,
         warmup_minutes, climbed_today, session_rpe, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(log_date, injury_id) DO UPDATE SET
            pain_rest = excluded.pain_rest,
            pain_load = excluded.pain_load,
            morning_stiffness = excluded.morning_stiffness,
            swelling = excluded.swelling,
            warmup_minutes = excluded.warmup_minutes,
            climbed_today = excluded.climbed_today,
            session_rpe = excluded.session_rpe,
            notes = excluded.notes
        """,
        (
            log_date,
            injury_id,
            _clamp(payload.get("pain_rest"), 0, 10),
            _clamp(payload.get("pain_load"), 0, 10),
            _clamp(payload.get("morning_stiffness"), 0, 10),
            _clamp(payload.get("swelling"), 0, 3),
            _clamp(payload.get("warmup_minutes"), 0, 180),
            1 if payload.get("climbed_today") else 0,
            _clamp(payload.get("session_rpe"), 0, 10),
            str(payload.get("notes") or "").strip(),
        ),
    )
    conn.commit()
    conn.close()
    bump_db_stamp()
    return build_rehab_dashboard()


def upsert_injury(payload):
    title = str(payload.get("title") or "").strip()
    inj_id = str(payload.get("id") or "").strip()
    if not inj_id:
        if not title:
            raise ValueError("title or id is required")
        slug = "".join(ch if ch.isalnum() else "_" for ch in title.lower()).strip("_")[:40]
        inj_id = "{0}_{1}".format(slug or "injury", datetime.now().strftime("%Y%m%d%H%M%S"))

    conn = get_connection()
    ensure_rehab_seeded(conn)
    existing = conn.execute("SELECT * FROM rehab_injuries WHERE id = ?", (inj_id,)).fetchone()
    is_demo_val = 1 if _is_demo_mode() else 0

    if existing:
        ex_dict = dict(existing)
        merged = {
            "title": title or ex_dict["title"],
            "body_region": str(payload.get("body_region") or ex_dict["body_region"]),
            "side": str(payload.get("side") or ex_dict["side"]),
            "tissue_type": str(payload.get("tissue_type") or ex_dict["tissue_type"]),
            "suspected_grade": str(payload.get("suspected_grade") if "suspected_grade" in payload else ex_dict["suspected_grade"]),
            "phase": str(payload.get("phase") or ex_dict["phase"]),
            "status": str(payload.get("status") or ex_dict["status"]),
            "onset_date": str(payload.get("onset_date") if "onset_date" in payload else ex_dict["onset_date"]),
            "mechanism": str(payload.get("mechanism") if "mechanism" in payload else ex_dict["mechanism"]),
            "symptoms": str(payload.get("symptoms") if "symptoms" in payload else ex_dict["symptoms"]),
            "anatomy_note": str(payload.get("anatomy_note") if "anatomy_note" in payload else ex_dict["anatomy_note"]),
            "climbing_modifications": str(payload.get("climbing_modifications") if "climbing_modifications" in payload else ex_dict["climbing_modifications"]),
            "red_flags": str(payload.get("red_flags") if "red_flags" in payload else ex_dict["red_flags"]),
            "protocol_id": str(payload.get("protocol_id") or ex_dict["protocol_id"]),
            "notes": str(payload.get("notes") if "notes" in payload else ex_dict["notes"]),
        }
        conn.execute(
            """
            UPDATE rehab_injuries
            SET title=?, body_region=?, side=?, tissue_type=?, suspected_grade=?, phase=?, status=?,
                onset_date=?, mechanism=?, symptoms=?, anatomy_note=?, climbing_modifications=?,
                red_flags=?, protocol_id=?, notes=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
            """,
            (
                merged["title"], merged["body_region"], merged["side"], merged["tissue_type"],
                merged["suspected_grade"], merged["phase"], merged["status"], merged["onset_date"],
                merged["mechanism"], merged["symptoms"], merged["anatomy_note"],
                merged["climbing_modifications"], merged["red_flags"], merged["protocol_id"],
                merged["notes"], inj_id,
            ),
        )
    else:
        region = str(payload.get("body_region") or "fingers")
        default_proto_map = {
            "fingers": "finger_pulley_rehab",
            "toe_foot": "big_toe_turf_toe",
            "knee": "knee_lcl_strength",
            "calf_achilles": "upper_calf_heel_hook",
            "hamstring": "hamstring_warmup_eccentric",
        }
        conn.execute(
            """
            INSERT INTO rehab_injuries
            (id, title, body_region, side, tissue_type, suspected_grade, phase, status,
             onset_date, mechanism, symptoms, anatomy_note, climbing_modifications,
             red_flags, protocol_id, notes, updated_at, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            """,
            (
                inj_id,
                title,
                region,
                str(payload.get("side") or "bilateral"),
                str(payload.get("tissue_type") or "tendon"),
                str(payload.get("suspected_grade") or "Grade 1"),
                str(payload.get("phase") or "subacute"),
                str(payload.get("status") or "active"),
                str(payload.get("onset_date") or datetime.now().strftime("%Y-%m-%d")),
                str(payload.get("mechanism") or ""),
                str(payload.get("symptoms") or ""),
                str(payload.get("anatomy_note") or ""),
                str(payload.get("climbing_modifications") or _default_climbing_mods(region)),
                str(payload.get("red_flags") or "Stop if sharp pain >= 5/10, swelling escalates, or joint catches/locks."),
                str(payload.get("protocol_id") or default_proto_map.get(region, "pre_climb_warmup")),
                str(payload.get("notes") or ""),
                is_demo_val,
            ),
        )
    conn.commit()
    conn.close()
    bump_db_stamp()
    return build_rehab_dashboard()


def delete_injury(injury_id):
    conn = get_connection()
    _ensure_rehab_tables(conn)
    conn.execute("DELETE FROM rehab_daily_logs WHERE injury_id = ?", (injury_id,))
    cur = conn.execute("DELETE FROM rehab_injuries WHERE id = ?", (injury_id,))
    conn.commit()
    conn.close()
    bump_db_stamp()
    return cur.rowcount > 0


def record_workout_session(payload):
    protocol_id = str(payload.get("protocol_id") or "adaptive_today").strip()
    protocol_title = str(payload.get("protocol_title") or PROTOCOLS.get(protocol_id, {}).get("title") or "Rehab Session").strip()
    session_date = str(payload.get("session_date") or datetime.now().strftime("%Y-%m-%d")).strip()

    conn = get_connection()
    ensure_rehab_seeded(conn)
    conn.execute(
        """
        INSERT INTO rehab_workout_sessions
        (session_date, protocol_id, protocol_title, duration_sec, exercises_completed, total_exercises, post_pain, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_date,
            protocol_id,
            protocol_title,
            max(0, int(payload.get("duration_sec") or 0)),
            max(0, int(payload.get("exercises_completed") or 0)),
            max(0, int(payload.get("total_exercises") or 0)),
            max(0, min(10, int(payload.get("post_pain") or 0))),
            str(payload.get("notes") or "").strip(),
        ),
    )
    conn.commit()
    conn.close()
    bump_db_stamp()
    return build_rehab_dashboard()


def record_assessment(payload):
    test_id = str(payload.get("test_id") or "").strip()
    if not test_id:
        raise ValueError("test_id is required")
    test_def = next((t for t in ASSESSMENT_CATALOG if t["id"] == test_id), None)
    if not test_def:
        raise ValueError("Unknown assessment test_id: {0}".format(test_id))

    assessed_date = str(payload.get("assessed_date") or datetime.now().strftime("%Y-%m-%d")).strip()

    def _opt_float(val):
        if val is None or val == "":
            return None
        return round(float(val), 2)

    conn = get_connection()
    ensure_rehab_seeded(conn)
    conn.execute(
        """
        INSERT INTO rehab_assessments
        (assessed_date, test_id, left_val, right_val, bilateral_val, unit, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            assessed_date,
            test_id,
            _opt_float(payload.get("left_val")),
            _opt_float(payload.get("right_val")),
            _opt_float(payload.get("bilateral_val")),
            test_def.get("unit") or "",
            str(payload.get("notes") or "").strip(),
        ),
    )
    conn.commit()
    conn.close()
    bump_db_stamp()
    return build_rehab_dashboard()

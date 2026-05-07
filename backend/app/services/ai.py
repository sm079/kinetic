import contextvars
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import TypedDict, Optional

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph

from app.core.llm import get_llm
from app.core.prompts import SYSTEM_PROMPT
from app.models.biometric import Biometric
from app.models.conversation import Conversation, Message
from app.models.nutrition import NutritionLog
from app.models.user import User
from app.models.workout import Workout
from app.models.workout_plan import WorkoutPlan

logger = logging.getLogger(__name__)

_uid: contextvars.ContextVar[str] = contextvars.ContextVar("ai_uid")
MAX_TOOL_ROUNDS = 4


# ── Tool helpers ──────────────────────────────────────────────────────────────

def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _end_dt(s: str | None) -> datetime | None:
    dt = _parse_dt(s)
    if dt is None:
        return None
    return datetime(dt.year, dt.month, dt.day, 23, 59, 59, tzinfo=timezone.utc)


# ── Tools ─────────────────────────────────────────────────────────────────────

@tool
async def get_exercise_history(
    exercise_name: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """
    Fetch max working weight per session for a specific exercise over a date range.
    Returns date + weight data points suitable for a strength-progress line graph.
    exercise_name: exact name, e.g. "Bench Press" or "Squat"
    start_date / end_date: ISO date YYYY-MM-DD, optional (omit for all-time)
    """
    uid = _uid.get()
    q = Workout.find(Workout.user_id == uid)
    if dt := _parse_dt(start_date):
        q = q.find(Workout.started_at >= dt)
    if dt := _end_dt(end_date):
        q = q.find(Workout.started_at <= dt)
    workouts = await q.sort("started_at").to_list()

    name_lower = exercise_name.lower().strip()
    points: list[tuple[str, float, int]] = []
    for w in workouts:
        for a in w.activities:
            if a.type != "lift" or a.name.lower().strip() != name_lower:
                continue
            max_w = max_r = None
            for s in a.sets:
                if not s.completed or s.is_warmup or not s.current_performance:
                    continue
                p = s.current_performance
                if p.weight_kg is not None and (max_w is None or p.weight_kg > max_w):
                    max_w, max_r = p.weight_kg, p.reps
            if max_w is not None:
                points.append((w.started_at.strftime("%Y-%m-%d"), max_w, max_r or 0))

    if not points:
        candidates: set[str] = {
            a.name for w in workouts for a in w.activities
            if a.type == "lift" and name_lower in a.name.lower()
        }
        hint = f" Did you mean: {', '.join(sorted(candidates))}?" if candidates else ""
        return f"No data for '{exercise_name}'.{hint}"

    lines = [
        f"Exercise: {exercise_name}  |  {len(points)} sessions",
        "date, max_weight_kg, reps",
        *[f"  {d}: {w}kg × {r}" for d, w, r in points],
        "→ Generate a line graph (x=date, y=max_weight_kg, unit='kg').",
    ]
    return "\n".join(lines)


@tool
async def get_workout_volume(
    start_date: str | None = None,
    end_date: str | None = None,
    group_by: str = "week",
) -> str:
    """
    Total training volume (kg × reps) over a date range, grouped by day/week/month.
    Use for volume trend graphs.
    group_by: "day", "week", or "month"
    """
    uid = _uid.get()
    q = Workout.find(Workout.user_id == uid, Workout.completed_at != None)
    if dt := _parse_dt(start_date):
        q = q.find(Workout.started_at >= dt)
    if dt := _end_dt(end_date):
        q = q.find(Workout.started_at <= dt)
    workouts = await q.sort("started_at").to_list()
    if not workouts:
        return "No completed workouts in that date range."

    def key(dt: datetime) -> str:
        if group_by == "day":
            return dt.strftime("%Y-%m-%d")
        if group_by == "month":
            return dt.strftime("%Y-%m")
        return (dt.date() - timedelta(days=dt.weekday())).isoformat()

    buckets: dict[str, float] = {}
    for w in workouts:
        k = key(w.started_at)
        vol = sum(
            (s.current_performance.weight_kg or 0) * (s.current_performance.reps or 0)
            for a in w.activities if a.type == "lift"
            for s in a.sets if s.completed and not s.is_warmup and s.current_performance
        )
        buckets[k] = buckets.get(k, 0.0) + vol

    lines = [
        f"Volume by {group_by}  |  {len(buckets)} buckets",
        "period, total_volume_kg",
        *[f"  {k}: {round(v)}" for k, v in sorted(buckets.items())],
        "→ Generate a bar graph (x=period, y=total_volume_kg, unit='kg').",
    ]
    return "\n".join(lines)


@tool
async def get_biometric_trend(
    metric: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """
    Biometric time series for a specific metric over a date range.
    metric options: weight_kg, body_fat_pct, muscle_mass_kg, visceral_fat_level,
                    chest_cm, waist_cm, hips_cm, thigh_cm, bicep_cm, calf_cm,
                    wellness_sleep, wellness_recovery, wellness_stress, wellness_energy
    """
    VALID = {
        "weight_kg", "body_fat_pct", "muscle_mass_kg", "visceral_fat_level",
        "chest_cm", "waist_cm", "hips_cm", "thigh_cm", "bicep_cm", "calf_cm",
        "wellness_sleep", "wellness_recovery", "wellness_stress", "wellness_energy",
    }
    if metric not in VALID:
        return f"Unknown metric '{metric}'. Valid: {', '.join(sorted(VALID))}"

    uid = _uid.get()
    q = Biometric.find(Biometric.user_id == uid)
    if dt := _parse_dt(start_date):
        q = q.find(Biometric.recorded_at >= dt)
    if dt := _end_dt(end_date):
        q = q.find(Biometric.recorded_at <= dt)
    entries = await q.sort("recorded_at").to_list()

    points = [
        (e.recorded_at.strftime("%Y-%m-%d"), getattr(e, metric))
        for e in entries if getattr(e, metric, None) is not None
    ]
    if not points:
        return f"No '{metric}' data" + (f" from {start_date} to {end_date}" if start_date or end_date else "") + "."

    suffix = {"weight_kg": "kg", "body_fat_pct": "%", "muscle_mass_kg": "kg"}.get(metric, "")
    lines = [
        f"Metric: {metric}  |  {len(points)} entries",
        "date, value",
        *[f"  {d}: {v}" for d, v in points],
        f"→ Generate a line graph (unit='{suffix or metric}').",
    ]
    return "\n".join(lines)


@tool
async def get_nutrition_trend(
    metric: str = "calories",
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """
    Daily nutrition intake for a metric over a date range.
    metric: "calories", "protein_g", "carbs_g", "fat_g"
    """
    VALID = {"calories", "protein_g", "carbs_g", "fat_g"}
    if metric not in VALID:
        return f"Invalid metric. Use: {', '.join(sorted(VALID))}"

    uid = _uid.get()
    start_str = start_date or "0000-01-01"
    end_str = end_date or "9999-12-31"
    logs = await NutritionLog.find(
        NutritionLog.user_id == uid,
        {"date": {"$gte": start_str, "$lte": end_str}},
    ).sort("date").to_list()

    def day_val(log) -> float:
        total = 0.0
        for meal in log.meals:
            for item in meal.items:
                if metric == "calories":    total += item.calories or 0
                elif metric == "protein_g": total += item.protein_g or 0
                elif metric == "carbs_g":   total += item.carbs_g or 0
                elif metric == "fat_g":     total += item.fat_g or 0
        return round(total, 1)

    points = [(log.date, day_val(log)) for log in logs if day_val(log) > 0]
    if not points:
        return f"No '{metric}' data in that range."

    unit = {"calories": "kcal", "protein_g": "g", "carbs_g": "g", "fat_g": "g"}.get(metric, "")
    lines = [
        f"Nutrition: {metric}  |  {len(points)} days",
        "date, value",
        *[f"  {d}: {v}" for d, v in points],
        f"→ Generate a bar graph (unit='{unit}').",
    ]
    return "\n".join(lines)


@tool
async def get_session_frequency(
    start_date: str | None = None,
    end_date: str | None = None,
    group_by: str = "week",
) -> str:
    """
    Workout session counts over a date range, grouped by day/week/month.
    Use for training consistency / frequency graphs.
    group_by: "day", "week", or "month"
    """
    uid = _uid.get()
    q = Workout.find(Workout.user_id == uid, Workout.completed_at != None)
    if dt := _parse_dt(start_date):
        q = q.find(Workout.started_at >= dt)
    if dt := _end_dt(end_date):
        q = q.find(Workout.started_at <= dt)
    workouts = await q.sort("started_at").to_list()
    if not workouts:
        return "No sessions in that date range."

    def key(dt: datetime) -> str:
        if group_by == "day":   return dt.strftime("%Y-%m-%d")
        if group_by == "month": return dt.strftime("%Y-%m")
        return (dt.date() - timedelta(days=dt.weekday())).isoformat()

    buckets: dict[str, int] = {}
    for w in workouts:
        k = key(w.started_at)
        buckets[k] = buckets.get(k, 0) + 1

    lines = [
        f"Sessions by {group_by}  |  {sum(buckets.values())} total",
        "period, count",
        *[f"  {k}: {v}" for k, v in sorted(buckets.items())],
        "→ Generate a bar graph (unit='sessions').",
    ]
    return "\n".join(lines)


AI_TOOLS = [
    get_exercise_history,
    get_workout_volume,
    get_biometric_trend,
    get_nutrition_trend,
    get_session_frequency,
]
_TOOL_MAP = {t.name: t for t in AI_TOOLS}


# ── Helpers (kept from original) ──────────────────────────────────────────────

def _item_totals(meals):
    cal = pro = carb = fat = 0.0
    for meal in meals:
        for item in meal.items:
            cal  += item.calories or 0
            pro  += item.protein_g or 0
            carb += item.carbs_g or 0
            fat  += item.fat_g or 0
    return round(cal), round(pro), round(carb), round(fat)


def _compress_sets(sets):
    work = [
        s for s in sets
        if s.completed and not s.is_warmup
        and s.current_performance
        and s.current_performance.weight_kg is not None
        and s.current_performance.reps is not None
    ]
    if not work:
        return None
    weights = [s.current_performance.weight_kg for s in work]
    reps    = [s.current_performance.reps for s in work]
    if len(set(weights)) == 1 and len(set(reps)) == 1:
        return f"{len(work)}×{reps[0]} @ {weights[0]}kg"
    return ", ".join(f"{r}×{w}kg" for r, w in zip(reps, weights))


# ── State ─────────────────────────────────────────────────────────────────────

class State(TypedDict, total=False):
    user_id: str
    session_id: str
    user_message: str
    parent_message_id: Optional[str]
    context_package: str
    ai_response: str
    reply_text: str
    user_msg_id: str
    ai_msg_id: str
    stream_callback: Optional[object]
    messages: list
    tool_rounds: int


# ── Node 1: build slim context (no raw exercise history) ──────────────────────

async def load_context(state: State) -> dict:
    uid   = state["user_id"]
    now   = datetime.now(timezone.utc)
    today = now.date()
    sections: list[str] = []

    # User profile
    try:
        user = await User.get(uid)
        if user:
            parts = []
            if user.display_name:          parts.append(f"Name: {user.display_name}")
            if user.fitness_level:         parts.append(f"Level: {user.fitness_level}")
            if user.fitness_goal:          parts.append(f"Goal: {user.fitness_goal.replace('_', ' ')}")
            if user.preferred_equipment:   parts.append(f"Equipment: {user.preferred_equipment.replace('_', ' ')}")
            if user.days_per_week:         parts.append(f"Target: {user.days_per_week}x/week")
            if user.preferred_units:       parts.append(f"Units: {user.preferred_units}")
            if user.age:                   parts.append(f"Age: {user.age}")
            if user.gender:                parts.append(f"Sex: {user.gender}")
            if parts:
                sections.append("USER PROFILE\n  " + " | ".join(parts))
    except Exception:
        logger.warning("Failed to load user profile for AI context")

    # Training: PRs + last 5 sessions
    workouts = (
        await Workout.find(Workout.user_id == uid)
        .sort("-started_at")
        .limit(60)
        .to_list()
    )

    prs: dict[str, dict] = {}
    for w in workouts:
        for a in w.activities:
            if a.type != "lift":
                continue
            for s in a.sets:
                if not s.completed or s.is_warmup:
                    continue
                perf = s.current_performance
                if not perf or perf.weight_kg is None or perf.reps is None:
                    continue
                if a.name not in prs or perf.weight_kg > prs[a.name]["kg"]:
                    prs[a.name] = {
                        "kg": perf.weight_kg,
                        "reps": perf.reps,
                        "date": w.started_at.strftime("%Y-%m-%d"),
                    }

    completed = [w for w in workouts if w.completed_at]
    this_month = sum(
        1 for w in completed
        if w.started_at.year == today.year and w.started_at.month == today.month
    )
    session_dates = {w.started_at.date() for w in completed}
    streak = 0
    d = today
    while d in session_dates:
        streak += 1
        d -= timedelta(days=1)

    stat_line = (
        f"  {len(workouts)} sessions total"
        f" | This month: {this_month}"
        f" | Streak: {streak} days"
    )

    pr_lines: list[str] = []
    if prs:
        pr_lines.append("  PRs (heaviest logged set):")
        for name, pr in sorted(prs.items(), key=lambda x: -x[1]["kg"]):
            pr_lines.append(f"    {name}: {pr['kg']}kg × {pr['reps']}  ({pr['date']})")

    recent = workouts[:5]
    w_lines: list[str] = []
    for w in recent:
        dur = ""
        if w.completed_at:
            mins = round((w.completed_at - w.started_at).total_seconds() / 60)
            dur = f" [{mins}min]"
        vol = sum(
            (s.current_performance.weight_kg or 0) * (s.current_performance.reps or 0)
            for a in w.activities if a.type == "lift"
            for s in a.sets
            if s.completed and not s.is_warmup and s.current_performance
        )
        vol_str = f" | vol {round(vol):,}kg" if vol > 0 else ""
        status = " [IN PROGRESS]" if not w.completed_at else ""
        w_lines.append(f"  {w.started_at.strftime('%Y-%m-%d')}  {w.name}{dur}{vol_str}{status}")
        for a in w.activities:
            if a.type == "lift":
                sets_str = _compress_sets(a.sets)
                if sets_str:
                    note_tag = f' | note: "{a.note}"' if a.note else ""
                    w_lines.append(f"    {a.name}: {sets_str}{note_tag}")
            elif a.type == "cardio":
                parts = []
                if a.distance_meters:
                    parts.append(f"{a.distance_meters / 1000:.1f}km")
                if a.duration_seconds:
                    parts.append(f"{round(a.duration_seconds / 60)}min")
                w_lines.append(f"    {a.name} [cardio]: {', '.join(parts) or '—'}")

    training_section = "\n".join(filter(None, [
        "TRAINING",
        stat_line,
        "\n".join(pr_lines) if pr_lines else None,
        f"  Last {len(recent)} sessions:",
        "\n".join(w_lines) if w_lines else "  None yet.",
    ]))
    sections.append(training_section)

    # Active program
    try:
        plan = await (
            WorkoutPlan.find(WorkoutPlan.user_id == uid)
            .sort("-updated_at")
            .first_or_none()
        )
        if plan:
            meta_parts = []
            if plan.details.level:          meta_parts.append(plan.details.level.value)
            if plan.details.duration_weeks: meta_parts.append(f"{plan.details.duration_weeks}wk")
            if plan.details.days_per_week:  meta_parts.append(f"{plan.details.days_per_week}x/week")
            meta = f" ({', '.join(meta_parts)})" if meta_parts else ""
            prog_lines = [f"ACTIVE PROGRAM: {plan.name}{meta}"]
            if plan.weeks:
                prog_lines.append("  Week 1 schedule:")
                for day in plan.weeks[0].days:
                    lifts  = [a.name for a in day.activities if a.type == "lift"]
                    cardio = [a.name for a in day.activities if a.type == "cardio"]
                    day_parts = []
                    if lifts:  day_parts.append(", ".join(lifts))
                    if cardio: day_parts.append(f"cardio: {', '.join(cardio)}")
                    if day_parts:
                        prog_lines.append(f"    {day.label}: {' | '.join(day_parts)}")
            sections.append("\n".join(prog_lines))
    except Exception:
        logger.warning("Failed to load active program for AI context")

    # Biometrics: trend summary only (detail fetched via tool)
    try:
        cutoff = now - timedelta(weeks=12)
        bios = (
            await Biometric.find(Biometric.user_id == uid, Biometric.recorded_at >= cutoff)
            .sort("-recorded_at")
            .to_list()
        )
        if bios:
            bio_lines = ["BIOMETRICS (12-week summary)"]
            latest = bios[0]

            w_entries = [(b.recorded_at, b.weight_kg) for b in reversed(bios) if b.weight_kg is not None]
            if len(w_entries) >= 2:
                delta = w_entries[-1][1] - w_entries[0][1]
                sign  = "+" if delta > 0 else ""
                span  = (w_entries[-1][0] - w_entries[0][0]).days
                bio_lines.append(
                    f"  Weight: {w_entries[0][1]}→{w_entries[-1][1]}kg"
                    f" ({sign}{delta:.1f}kg over {span}d, {len(w_entries)} entries)"
                )
            elif w_entries:
                bio_lines.append(f"  Weight: {w_entries[0][1]}kg")

            bf_entries = [(b.recorded_at, b.body_fat_pct) for b in reversed(bios) if b.body_fat_pct is not None]
            if len(bf_entries) >= 2:
                delta = bf_entries[-1][1] - bf_entries[0][1]
                sign  = "+" if delta > 0 else ""
                bio_lines.append(f"  Body fat: {bf_entries[0][1]}%→{bf_entries[-1][1]}% ({sign}{delta:.1f}%)")

            w_parts = []
            for label, val in [
                ("sleep", latest.wellness_sleep), ("recovery", latest.wellness_recovery),
                ("stress", latest.wellness_stress), ("energy", latest.wellness_energy),
            ]:
                if val is not None:
                    w_parts.append(f"{label} {val}/10")
            if w_parts:
                bio_lines.append(f"  Wellness ({latest.recorded_at.strftime('%Y-%m-%d')}): {', '.join(w_parts)}")

            sections.append("\n".join(bio_lines))
    except Exception:
        logger.warning("Failed to load biometrics for AI context")

    # Nutrition: 7-day summary
    try:
        cutoff_str = (today - timedelta(days=7)).isoformat()
        n_logs = (
            await NutritionLog.find(
                NutritionLog.user_id == uid,
                {"date": {"$gte": cutoff_str}},
            )
            .sort("-date")
            .to_list()
        )
        if n_logs:
            nut_lines = ["NUTRITION (last 7 days)"]
            goals_log = next((l for l in n_logs if l.calorie_goal), None)
            if goals_log:
                g_parts = [f"{goals_log.calorie_goal} kcal"]
                if goals_log.protein_goal_g: g_parts.append(f"P {goals_log.protein_goal_g}g")
                if goals_log.carbs_goal_g:   g_parts.append(f"C {goals_log.carbs_goal_g}g")
                if goals_log.fat_goal_g:     g_parts.append(f"F {goals_log.fat_goal_g}g")
                nut_lines.append(f"  Goals: {' | '.join(g_parts)}")

            t_cal = t_pro = t_carb = t_fat = days_n = hit_n = 0
            for log in n_logs:
                cal, pro, carb, fat = _item_totals(log.meals)
                if cal == 0:
                    continue
                t_cal += cal; t_pro += pro; t_carb += carb; t_fat += fat
                days_n += 1
                hit = log.calorie_goal and cal >= log.calorie_goal * 0.9
                hit_n += int(bool(hit))
                row = f"  {log.date}: {cal}kcal"
                if pro:  row += f" | P{pro}g"
                if carb: row += f" | C{carb}g"
                if fat:  row += f" | F{fat}g"
                nut_lines.append(row)

            if days_n > 1:
                nut_lines.append(
                    f"  Avg ({days_n}d): {round(t_cal/days_n)}kcal"
                    f" | P{round(t_pro/days_n)}g"
                    f" | Goal hit {hit_n}/{days_n}"
                )
            sections.append("\n".join(nut_lines))
    except Exception:
        logger.warning("Failed to load nutrition for AI context")

    return {"context_package": "\n\n".join(sections)}


# ── Node 2: call LLM with tools ───────────────────────────────────────────────

async def call_agent(state: State) -> dict:
    now   = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    now_str = now.strftime("%Y-%m-%d %H:%M UTC")
    _uid.set(state["user_id"])

    if not state.get("messages"):
        system = SYSTEM_PROMPT.format(context=state["context_package"], today=today, now=now_str)
        session = await Conversation.get(state["session_id"])
        if session:
            session.ensure_nodes()
        parent_id = state.get("parent_message_id")
        thread = session.get_thread(parent_id or session.active_tip_id) if session else []
        msgs: list = [SystemMessage(content=system)]
        for m in thread:
            msgs.append((HumanMessage if m.role == "user" else AIMessage)(content=m.content))
        msgs.append(HumanMessage(content=state["user_message"]))
    else:
        msgs = list(state["messages"])

    llm = get_llm().bind_tools(AI_TOOLS)
    response = await llm.ainvoke(msgs)
    return {
        "messages": msgs + [response],
        "tool_rounds": state.get("tool_rounds", 0),
    }


# ── Node 3: execute tool calls ────────────────────────────────────────────────

async def execute_tools(state: State) -> dict:
    msgs  = list(state["messages"])
    last  = msgs[-1]
    cb    = state.get("stream_callback")
    _uid.set(state["user_id"])

    for tc in last.tool_calls:
        if cb:
            await cb(f"\x00tool:{tc['name']}")
        fn = _TOOL_MAP.get(tc["name"])
        try:
            result = await fn.ainvoke(tc["args"]) if fn else f"Unknown tool: {tc['name']}"
        except Exception as exc:
            result = f"Tool error: {exc}"
            logger.exception("Tool %s failed", tc["name"])
        msgs.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))

    return {"messages": msgs, "tool_rounds": state.get("tool_rounds", 0) + 1}


# ── Node 4: stream final output ───────────────────────────────────────────────

async def stream_output(state: State) -> dict:
    msgs = list(state.get("messages", []))
    cb   = state.get("stream_callback")

    # call_agent uses ainvoke (non-streaming) for tool routing. Pop its final AIMessage
    # so we can re-generate the response via astream for real token-by-token streaming.
    if msgs and isinstance(msgs[-1], AIMessage) and not getattr(msgs[-1], "tool_calls", None):
        msgs = msgs[:-1]

    llm  = get_llm()
    full = ""
    buf  = ""
    in_reply = False
    closing  = "</reply>"
    try:
        async for chunk in llm.astream(msgs):
            text = chunk.content
            if not isinstance(text, str) or not text:
                continue
            full += text
            buf  += text

            if "<reply>" in buf and not in_reply:
                in_reply = True
                buf = buf.split("<reply>", 1)[1].lstrip("\n")

            if in_reply:
                if closing in buf:
                    clean, buf = buf.split(closing, 1)[0], ""
                    if clean and cb:
                        await cb(clean)
                    in_reply = False
                else:
                    hold = next(
                        (i for i in range(1, len(closing)) if buf.endswith(closing[:i])), 0
                    )
                    safe = buf[:-hold] if hold else buf
                    if safe and cb:
                        await cb(safe)
                    buf = buf[len(safe):]

        if "<reply>" not in full and full.strip() and cb:
            await cb(full.strip())
    except Exception:
        logger.exception("LLM stream failed")
        if cb:
            await cb("\x00error")

    return {"ai_response": full}


def _coerce_text(content) -> str:
    """Normalise AIMessage.content to plain string (Claude may return a list of blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b.get("text", "") if isinstance(b, dict) else str(b)
            for b in content
        )
    return str(content or "")


async def _dispatch(content, cb) -> None:
    """Send already-generated (non-streamed) content via callback."""
    if not cb:
        return
    text_content = _coerce_text(content)
    if not text_content:
        return
    m = re.search(r"<reply>(.*?)</reply>", text_content, re.DOTALL)
    text = m.group(1).strip() if m else text_content.strip()
    if text:
        await cb(text)


# ── Node 5: save messages ─────────────────────────────────────────────────────

async def save_messages(state: State) -> dict:
    raw = state.get("ai_response", "")
    m = re.search(r"<reply>(.*?)</reply>", raw, re.DOTALL)
    reply = m.group(1).strip() if m else raw.strip()

    session = await Conversation.get(state["session_id"])
    if not session:
        return {"reply_text": reply, "user_msg_id": "", "ai_msg_id": ""}

    session.ensure_nodes()
    parent_id = state.get("parent_message_id") or session.active_tip_id

    user_msg = Message(role="user", content=state["user_message"], parent_id=parent_id)
    ai_msg   = Message(role="assistant", content=reply or "…", parent_id=user_msg.id)
    session.nodes.extend([user_msg, ai_msg])
    session.active_tip_id = ai_msg.id
    session.sync_messages()
    session.updated_at = datetime.now(timezone.utc)

    if not session.title and len(session.messages) <= 2:
        session.title = state["user_message"][:60]

    await session.save()
    return {"reply_text": reply, "user_msg_id": user_msg.id, "ai_msg_id": ai_msg.id}


# ── Routing ────────────────────────────────────────────────────────────────────

def _route(state: State) -> str:
    msgs = state.get("messages", [])
    if not msgs:
        return "stream_output"
    last = msgs[-1]
    if getattr(last, "tool_calls", None) and state.get("tool_rounds", 0) < MAX_TOOL_ROUNDS:
        return "execute_tools"
    return "stream_output"


# ── Build graph ────────────────────────────────────────────────────────────────

def _build():
    g = StateGraph(State)
    g.add_node("load_context",  load_context)
    g.add_node("call_agent",    call_agent)
    g.add_node("execute_tools", execute_tools)
    g.add_node("stream_output", stream_output)
    g.add_node("save_messages", save_messages)

    g.add_edge("load_context", "call_agent")
    g.add_conditional_edges("call_agent", _route, {
        "execute_tools": "execute_tools",
        "stream_output": "stream_output",
    })
    g.add_edge("execute_tools", "call_agent")
    g.add_edge("stream_output", "save_messages")
    g.set_entry_point("load_context")
    g.set_finish_point("save_messages")
    return g.compile()


conversation_graph = _build()

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.celery_app import celery
from app.config import settings

logger = logging.getLogger(__name__)


def _run(coro):
    return asyncio.run(coro)


async def _make_client():
    from supabase import acreate_client
    return await acreate_client(settings.supabase_url, settings.supabase_service_role_key)


@celery.task(name="app.tasks.trigger_full_sync", bind=True, max_retries=3)
def trigger_full_sync(self, user_id: str, days_back: int = 90):
    async def _sync():
        from app.services.garmin_sync import sync_activities, sync_daily_health
        sb = await _make_client()
        activities, activity_files = await sync_activities(user_id, sb, days_back=days_back)
        health, missing_metrics = await sync_daily_health(user_id, sb, days_back=days_back)
        return {"activities": activities, "activity_files": activity_files, "health_days": health, "missing_health_metrics": missing_metrics}

    try:
        result = _run(_sync())
        logger.info("Full sync complete for user %s: %s", user_id, result)
        return result
    except Exception as exc:
        logger.error("Sync failed for user %s: %s", user_id, exc)
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


@celery.task(name="app.tasks.sync_all_users")
def sync_all_users(days_back: int = 7):
    async def _get_user_ids():
        sb = await _make_client()
        res = await sb.table("users").select("id").not_.is_("garmin_session_data", "null").execute()
        return [row["id"] for row in (res.data or [])]

    user_ids = _run(_get_user_ids())
    logger.info("Scheduling sync for %d users", len(user_ids))
    for uid in user_ids:
        trigger_full_sync.delay(uid, days_back=days_back)
    return {"scheduled": len(user_ids)}


@celery.task(name="app.tasks.analyze_activity", bind=True, max_retries=2)
def analyze_activity(self, user_id: str, activity_id: str):
    async def _analyze():
        if not settings.openai_api_key:
            return

        from openai import OpenAI
        sb = await _make_client()

        act_res = await sb.table("activities").select("*").eq("id", activity_id).eq(
            "user_id", user_id
        ).limit(1).execute()
        if not act_res.data or act_res.data[0].get("ai_analysis"):
            return

        act = act_res.data[0]
        cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
        recent_res = await sb.table("activities").select(
            "discipline,distance_meters,duration_seconds,avg_hr,tss,start_time"
        ).eq("user_id", user_id).gte("start_time", cutoff).order(
            "start_time", desc=True
        ).limit(20).execute()

        def _fmt(a: dict) -> str:
            d = str(a.get("start_time", ""))[:10]
            dist = f"{(a.get('distance_meters') or 0)/1000:.1f}km" if a.get("distance_meters") else ""
            dur_min = (a.get("duration_seconds") or 0) // 60
            hr = f"HR:{a['avg_hr']}" if a.get("avg_hr") else ""
            tss = f"TSS:{a['tss']:.0f}" if a.get("tss") else ""
            return f"{d} {a.get('discipline','')} {dist} {dur_min}min {hr} {tss}".strip()

        context_lines = [_fmt(a) for a in (recent_res.data or []) if a.get("id") != activity_id]
        context = "\n".join(context_lines[:10])

        act_desc = _fmt(act)
        if act.get("discipline") == "STRENGTH" and act.get("exercises"):
            ex_names = [e.get("name", "") for e in act["exercises"][:5]]
            act_desc += f" | Exercises: {', '.join(ex_names)}"

        prompt = (
            f"Athlete just completed: {act_desc}\n\n"
            f"Recent training context (last 14 days):\n{context or 'No prior data'}\n\n"
            "Write a 2-3 sentence coach note for this session. "
            "Be specific, reference the numbers, and give one actionable takeaway."
        )

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.responses.create(
            model=settings.openai_analysis_model,
            instructions=(
                "You are a concise endurance and triathlon coach. "
                "Write a short, specific training note grounded in the provided metrics."
            ),
            input=prompt,
            max_output_tokens=256,
        )
        analysis = response.output_text.strip()

        await sb.table("activities").update({
            "ai_analysis": analysis,
            "ai_analyzed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", activity_id).execute()

    try:
        _run(_analyze())
        logger.info("Activity analysis complete: %s", activity_id)
    except Exception as exc:
        logger.error("Analysis failed for activity %s: %s", activity_id, exc)
        raise self.retry(exc=exc, countdown=30)

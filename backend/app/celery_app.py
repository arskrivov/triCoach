from celery import Celery
from app.config import settings


def _redis_url_with_ssl(url: str) -> str:
    """Append ssl_cert_reqs=CERT_NONE to rediss:// URLs if not already present."""
    if url.startswith("rediss://") and "ssl_cert_reqs" not in url:
        separator = "&" if "?" in url else "?"
        return f"{url}{separator}ssl_cert_reqs=CERT_NONE"
    return url


_broker_url = _redis_url_with_ssl(settings.redis_url)

celery = Celery(
    "personal_coach",
    broker=_broker_url,
    backend=_broker_url,
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

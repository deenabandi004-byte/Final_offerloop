"""daemons.py — the background daemons, in their own process.

Deploy as a Render background worker:
    Build:  pip install -r backend/requirements.txt
    Start:  PYTHONPATH=/opt/render/project/src:/opt/render/project/src/backend \
            RUN_DAEMONS=true python backend/daemons.py

Why a separate process?
-----------------------
These four daemons (tracker scanner, Gmail watch renewal, watchdog, hourly agent
digest) used to run inside the gunicorn WEB process. create_app() runs at module
level and gunicorn forks a worker from it, so EVERY web worker started its own
copy of all four. With --workers 2 that meant two Gmail watch-renewal loops and
two hourly agent digests running in parallel — duplicate work pointed at real
users, not merely duplicate memory. It also hard-capped the web service at a
single worker: scaling out multiplied the daemons instead of the throughput.

Why not the RQ worker (worker.py)?
----------------------------------
RQ forks a child process per job. Forking a process that holds live gRPC /
Firestore threads is a documented deadlock hazard — the same
"Other threads are currently calling into gRPC, skipping fork() handlers"
warning already shows up wherever we fork with threads running. Putting
long-lived daemon threads in the parent of a forking worker would put
auto-apply and meeting prep at risk to save $7. Not worth it.

So: web serves requests (RUN_DAEMONS=false), the RQ worker runs jobs, and this
process owns the daemons. One of each, no forking, no duplication.
"""
from __future__ import annotations

import logging
import os
import sys
import time

# Match worker.py: make both the repo root and backend/ importable, so
# `backend.wsgi` (which uses package-relative imports) resolves.
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
for _p in (_ROOT, _HERE):
    if _p not in sys.path:
        sys.path.insert(0, _p)

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("daemons")


def main() -> None:
    # create_app() starts the daemon threads when RUN_DAEMONS is truthy. Be
    # explicit rather than relying on the default: this process exists ONLY to
    # run them, so if the flag is off, that is a misconfiguration worth shouting
    # about instead of idling silently forever.
    if os.getenv("RUN_DAEMONS", "true").strip().lower() in ("0", "false", "no", "off"):
        raise SystemExit(
            "RUN_DAEMONS is false in the daemons service — this process would do "
            "nothing. Set RUN_DAEMONS=true here (and false on the web service)."
        )

    logger.info("Booting Flask app to start the background daemons...")
    from backend.wsgi import create_app

    create_app()  # registers + starts the daemon threads
    logger.info("Daemons running: tracker scanner, Gmail watch renewal, watchdog, agent digest")

    # The daemons are daemon=True threads, so the process must stay alive or
    # they die with it.
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()

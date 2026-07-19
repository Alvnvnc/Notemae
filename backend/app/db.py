from psycopg_pool import ConnectionPool

from .config import settings


pool = ConnectionPool(
    conninfo=settings.database_url,
    min_size=1,
    max_size=10,
    open=False,
)


def start_pool() -> None:
    pool.open(wait=True)


def stop_pool() -> None:
    pool.close()

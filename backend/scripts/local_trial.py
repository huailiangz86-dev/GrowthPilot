"""Prepare and run the existing Web/Agent flow against a local PostgreSQL database.

Run with backend/.venv/bin/python. This helper never accepts a remote database,
never drops data, and never migrates as part of starting the services.
"""

import argparse
import asyncio
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from datetime import UTC, datetime
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))


def local_database(url):
    if url.get_backend_name() != "postgresql" or url.host not in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("本地试用只允许连接本机 PostgreSQL。")
    if not url.database or not url.database.startswith("growthpilot_") or not url.database.endswith(("_dev", "_trial", "_test")):
        raise ValueError("数据库名需以 growthpilot_ 开头，并以 _dev、_trial 或 _test 结尾。")
    return url


def pg_tool(name):
    found = shutil.which(name)
    if found:
        return found
    for directory in ("/opt/homebrew/opt/postgresql@17/bin", "/usr/local/opt/postgresql@17/bin"):
        candidate = Path(directory) / name
        if candidate.is_file():
            return str(candidate)
    raise RuntimeError(f"缺少 PostgreSQL 工具 {name}，未修改数据库。")


def expected_revision():
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


async def inspect_database(url, create=False):
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    admin = create_async_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as connection:
            exists = await connection.scalar(text("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=:name)"), {"name": url.database})
            if not exists and create:
                quoted = '"' + url.database.replace('"', '""') + '"'
                await connection.execute(text(f"CREATE DATABASE {quoted} ENCODING 'UTF8' TEMPLATE template0"))
                print(f"已创建本地数据库：{url.database}", flush=True)
    finally:
        await admin.dispose()
    if not exists and not create:
        return {"exists": False, "revision": None, "table_count": 0}
    engine = create_async_engine(url)
    try:
        async with engine.connect() as connection:
            tables = (await connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))).scalars().all()
            revision = await connection.scalar(text("SELECT version_num FROM alembic_version")) if "alembic_version" in tables else None
            return {"exists": True, "revision": revision, "table_count": len(tables), "created": not exists}
    finally:
        await engine.dispose()


def backup_database(url):
    directory = BACKEND / ".local-trial" / "backups"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = directory / f"{url.database}-{datetime.now(UTC):%Y%m%dT%H%M%S%fZ}.dump"
    env = dict(os.environ)
    env.update(PGHOST=url.host, PGPORT=str(url.port or 5432), PGDATABASE=url.database)
    if url.username:
        env["PGUSER"] = url.username
    if url.password:
        env["PGPASSWORD"] = url.password
    # Passwords stay out of command arguments, logs and saved artifacts.
    with destination.open("xb") as output:
        destination.chmod(0o600)
        subprocess.run([pg_tool("pg_dump"), "--format=custom", "--no-password"], stdout=output, env=env, check=True)
    subprocess.run([pg_tool("pg_restore"), "--list", str(destination)], stdout=subprocess.DEVNULL, check=True)
    print(f"升级前备份已验证：{destination}", flush=True)
    return destination


def prepare(url, database_url):
    current = asyncio.run(inspect_database(url))
    if current["exists"] and current["revision"] == expected_revision():
        print("数据库已是当前版本，无需升级。", flush=True)
        return
    if current["table_count"] and not current["revision"]:
        raise RuntimeError("现有数据库包含未登记迁移的表；请先核对，未修改数据库。")
    if current["table_count"]:
        backup_database(url)
    else:
        # Verify migration tooling before creating an empty database.
        expected_revision()
    asyncio.run(inspect_database(url, create=True))
    env = dict(os.environ, DATABASE_URL=database_url)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND, env=env, check=True)
    after = asyncio.run(inspect_database(url))
    if after["revision"] != expected_revision():
        raise RuntimeError("迁移后的版本不匹配，服务未启动。")
    print(f"本地数据库已就绪：{after['revision']}，{after['table_count']} 张表。", flush=True)


def port_available(port):
    with socket.socket() as connection:
        try:
            connection.bind(("127.0.0.1", port))
        except OSError as exc:
            raise RuntimeError(f"端口 {port} 已被占用；请先查看正在运行的服务。") from exc


def wait_ready(url, process):
    opener = build_opener(ProxyHandler({}))
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("服务启动失败，请查看上方日志。")
        try:
            with opener.open(url, timeout=2) as response:
                if response.status == 200:
                    return
        except (URLError, TimeoutError):
            pass
        time.sleep(0.25)
    raise RuntimeError("服务未在 30 秒内就绪，请查看上方日志。")


def start(url, database_url):
    current = asyncio.run(inspect_database(url))
    if current["revision"] != expected_revision():
        raise RuntimeError("数据库尚未就绪，请先执行 prepare。启动不会自动迁移。")
    for port in (8002, 4010):
        port_available(port)
    npm = shutil.which("npm")
    if not npm or not (ROOT / "web" / "node_modules" / "vite").is_dir():
        raise RuntimeError("Web 依赖尚未安装，请先在 web 目录安装依赖。")
    env = dict(os.environ, DATABASE_URL=database_url, WX_APP_ID="", WX_APP_SECRET="", DEBUG="false",
               APP_ENV="development", DEV_AUTH_ENABLED="true")
    processes = []
    try:
        # Local developer login uses the existing account contract, without
        # sending its development code to the configured WeChat service.
        api = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8002"], cwd=BACKEND, env=env)
        processes.append(api)
        wait_ready("http://127.0.0.1:8002/health", api)
        web = subprocess.Popen([npm, "run", "dev", "--", "--host", "127.0.0.1", "--port", "4010", "--strictPort"], cwd=ROOT / "web")
        processes.append(web)
        wait_ready("http://127.0.0.1:4010/login", web)
        print("本地真实试用：http://127.0.0.1:4010/login（开发者登录）", flush=True)
        print("独立 UI 原型：http://127.0.0.1:4010/prototype/trial", flush=True)
        while all(process.poll() is None for process in processes):
            time.sleep(0.5)
        raise RuntimeError("一个服务已经退出，正在关闭另一服务；数据保留在 PostgreSQL。")
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def main():
    parser = argparse.ArgumentParser(description="GrowthPilot 本地真实试用环境")
    parser.add_argument("action", choices=("status", "prepare", "start"))
    args = parser.parse_args()
    os.chdir(BACKEND)
    from sqlalchemy.engine import make_url
    from app.core.config import settings
    url = local_database(make_url(settings.DATABASE_URL))
    if args.action == "prepare":
        prepare(url, settings.DATABASE_URL)
    elif args.action == "start":
        start(url, settings.DATABASE_URL)
    else:
        current = asyncio.run(inspect_database(url))
        print(json.dumps({"database": url.database, **current, "expected_revision": expected_revision(), "qwen_configured": bool(settings.QWEN_API_KEY), "deepseek_configured": bool(settings.DEEPSEEK_API_KEY)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("本地服务已停止，数据库内容保留。")
    except Exception as error:
        # Connection errors can contain URLs; redact every configured password.
        message = str(error)
        from sqlalchemy.engine import make_url
        from app.core.config import settings
        password = make_url(settings.DATABASE_URL).password
        if password:
            message = message.replace(password, "***")
        print(f"试用环境操作失败：{message}", file=sys.stderr)
        sys.exit(1)

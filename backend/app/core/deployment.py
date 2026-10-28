"""Deployment URL validation shared by server-owned public entrypoints."""
from ipaddress import ip_address
from urllib.parse import urlsplit


def public_origin(base_url: str) -> str:
    parsed = urlsplit(base_url.strip())
    host = (parsed.hostname or "").rstrip(".").lower()
    if (parsed.scheme != "https" or not host or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment or parsed.path not in ("", "/")
            or host == "localhost" or host.endswith(".localhost")):
        raise ValueError("请先配置服务器的 HTTPS PUBLIC_BASE_URL。")
    parsed.port  # Validate malformed port values as well as the origin itself.
    try:
        address = ip_address(host)
    except ValueError:
        address = None
    if address is not None:
        local = address.is_loopback or address.is_unspecified
        if address.version == 6 and address.ipv4_mapped is not None:
            local = local or address.ipv4_mapped.is_loopback or address.ipv4_mapped.is_unspecified
        if local:
            raise ValueError("请配置可从其他设备访问的服务器 HTTPS 地址。")
    return f"{parsed.scheme}://{parsed.netloc}"

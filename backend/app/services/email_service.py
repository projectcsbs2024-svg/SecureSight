import os
import smtplib
import mimetypes
from email.message import EmailMessage
from threading import Thread

from dotenv import load_dotenv


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.dirname(BASE_DIR)
ENV_PATH = os.path.join(BACKEND_DIR, ".env")
load_dotenv(ENV_PATH)


def _get_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _smtp_config():
    username = (os.getenv("ALERT_SMTP_USERNAME") or os.getenv("MAIL_USERNAME") or "").strip()
    password = (os.getenv("ALERT_SMTP_PASSWORD") or os.getenv("MAIL_PASSWORD") or "").strip()
    from_email = (os.getenv("ALERT_FROM_EMAIL") or os.getenv("MAIL_FROM") or username).strip()
    host = (os.getenv("ALERT_SMTP_HOST") or os.getenv("MAIL_SERVER") or "").strip()

    if not host and username.lower().endswith("@gmail.com"):
        host = "smtp.gmail.com"

    port_str = (os.getenv("ALERT_SMTP_PORT") or os.getenv("MAIL_PORT") or "587").strip()
    port = int(port_str)
    use_ssl = _get_bool_env("ALERT_SMTP_USE_SSL", port == 465)
    use_tls = _get_bool_env("ALERT_SMTP_USE_TLS", not use_ssl)
    enabled = _get_bool_env("ALERT_EMAIL_ENABLED", True)
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_email": from_email,
        "use_ssl": use_ssl,
        "use_tls": use_tls,
        "enabled": enabled,
    }


def _resolve_attachment_from_image_url(image_url: str | None) -> tuple[str, bytes, str] | None:
    if not image_url:
        return None

    normalized_path = image_url.split("?", 1)[0].lstrip("/").replace("/", os.sep)
    absolute_path = os.path.join(BASE_DIR, normalized_path)
    absolute_path = os.path.abspath(absolute_path)
    static_root = os.path.abspath(os.path.join(BASE_DIR, "static"))

    if os.path.commonpath([static_root, absolute_path]) != static_root or not os.path.isfile(absolute_path):
        return None

    mime_type, _ = mimetypes.guess_type(absolute_path)
    mime_type = mime_type or "application/octet-stream"
    maintype, subtype = mime_type.split("/", 1)

    with open(absolute_path, "rb") as image_file:
        return os.path.basename(absolute_path), image_file.read(), f"{maintype}/{subtype}"


def email_service_ready() -> tuple[bool, str]:
    config = _smtp_config()
    if not config["enabled"]:
        return False, "email alerts disabled via ALERT_EMAIL_ENABLED"
    if not config["host"]:
        return False, "missing ALERT_SMTP_HOST"
    if not config["from_email"]:
        return False, "missing ALERT_FROM_EMAIL or ALERT_SMTP_USERNAME"
    if not config["password"]:
        return False, "missing ALERT_SMTP_PASSWORD"
    return True, "configured"


def send_detection_alert_email(
    recipients: list[str],
    camera_name: str,
    detection_type: str,
    subtype: str | None,
    confidence: float | None,
    timestamp: str,
    image_url: str | None,
) -> tuple[bool, str]:
    config = _smtp_config()
    if not recipients:
        return False, "no recipients configured"

    ready, reason = email_service_ready()
    if not ready:
        message = f"[EmailService] Skipping alert email: {reason}"
        print(message)
        return False, reason

    confidence_text = f"{confidence * 100:.2f}%" if confidence is not None else "N/A"
    subject_suffix = f" - {subtype}" if subtype else ""
    attachment = _resolve_attachment_from_image_url(image_url)
    attachment_status = "Attached" if attachment else "Not available"

    message = EmailMessage()
    message["Subject"] = f"SecureSight Alert: {detection_type.title()}{subject_suffix}"
    message["From"] = config["from_email"]
    message["To"] = ", ".join(recipients)
    message.set_content(
        "\n".join(
            [
                "A new SecureSight alert was detected.",
                f"Camera: {camera_name}",
                f"Detection Type: {detection_type}",
                f"Subtype: {subtype or 'N/A'}",
                f"Confidence: {confidence_text}",
                f"Timestamp (UTC): {timestamp}",
                f"Snapshot Attachment: {attachment_status}",
            ]
        )
    )

    if attachment:
        filename, content, mime_type = attachment
        maintype, subtype = mime_type.split("/", 1)
        message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

    try:
        if config["use_ssl"]:
            with smtplib.SMTP_SSL(config["host"], config["port"], timeout=20) as server:
                if config["username"] and config["password"]:
                    server.login(config["username"], config["password"])
                server.send_message(message)
        else:
            with smtplib.SMTP(config["host"], config["port"], timeout=20) as server:
                server.ehlo()
                if config["use_tls"]:
                    server.starttls()
                    server.ehlo()
                if config["username"] and config["password"]:
                    server.login(config["username"], config["password"])
                server.send_message(message)
        print(f"[EmailService] Alert email sent to {len(recipients)} recipient(s)")
        return True, "sent"
    except Exception as exc:
        print(f"[EmailService] Failed to send alert email: {exc}")
        return False, str(exc)


def notify_detection_async(
    recipients: list[str],
    camera_name: str,
    detection_type: str,
    subtype: str | None,
    confidence: float | None,
    timestamp: str,
    image_url: str | None,
):
    def _send_in_background():
        success, error = send_detection_alert_email(
            recipients, camera_name, detection_type, subtype, confidence, timestamp, image_url
        )
        if not success:
            print(f"[EmailService] Background alert email failed: {error}")

    Thread(target=_send_in_background, daemon=True).start()

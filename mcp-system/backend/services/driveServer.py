import json
import os
import re
import sys
from typing import List, Tuple

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/drive"]
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def resolve_existing_path(candidates: List[str], label: str) -> str:
    for path in candidates:
        if path and os.path.exists(path):
            return path
    raise FileNotFoundError(
        f"{label} not found. Checked: {', '.join(candidates)}"
    )


def resolve_paths() -> Tuple[str, str]:
    env_credentials = os.getenv("GOOGLE_CREDENTIALS_PATH", "").strip()
    env_token = os.getenv("GOOGLE_TOKEN_PATH", "").strip()

    cwd = os.getcwd()
    parent_of_root = os.path.abspath(os.path.join(ROOT_DIR, ".."))

    credentials_candidates = [
        env_credentials,
        os.path.join(ROOT_DIR, "credentials.json"),
        os.path.join(cwd, "credentials.json"),
        os.path.join(parent_of_root, "credentials.json"),
    ]

    token_candidates = [
        env_token,
        os.path.join(ROOT_DIR, "token.json"),
        os.path.join(cwd, "token.json"),
        os.path.join(parent_of_root, "token.json"),
    ]

    credentials_path = resolve_existing_path(
        credentials_candidates, "Google credentials.json"
    )

    token_path = ""
    for p in token_candidates:
        if p and os.path.exists(p):
            token_path = p
            break
    if not token_path:
        token_path = token_candidates[1]

    return credentials_path, token_path


def authenticate():
    creds = None
    credentials_path, token_path = resolve_paths()

    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(token_path, "w", encoding="utf-8") as token_file:
            token_file.write(creds.to_json())

    return creds


def create_folder(service, name: str, parent_id: str = None) -> str:
    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = service.files().create(body=metadata, fields="id,name").execute()
    return folder["id"]


def normalize_folder_list(text: str) -> List[str]:
    return [item.strip() for item in text.split(",") if item.strip()]


def parse_drive_folders(raw_query: str, parent_from_llm: str, folders_from_llm: List[str]) -> Tuple[str, List[str]]:
    query = raw_query.strip()

    marker = re.search(r"drive\s+folder[s]?\s+", query, flags=re.IGNORECASE)
    if marker:
        tail = query[marker.end():].strip()
    else:
        tail = ""

    if tail and "/" in tail:
        left, right = tail.split("/", 1)
        parent = left.strip()
        children = normalize_folder_list(right)
        return parent, children

    if parent_from_llm and folders_from_llm:
        return parent_from_llm.strip(), [f.strip() for f in folders_from_llm if str(f).strip()]

    if tail:
        return "", normalize_folder_list(tail)

    return "", [str(f).strip() for f in folders_from_llm if str(f).strip()]


def create_multiple_folders(service, parent_name: str, folders: List[str]) -> List[str]:
    created_messages = []

    parent_id = None
    if parent_name:
        parent_id = create_folder(service, parent_name)
        created_messages.append(f"Created parent folder: {parent_name}")

    for folder_name in folders:
        create_folder(service, folder_name, parent_id)
        if parent_name:
            created_messages.append(f"Created child folder: {parent_name}/{folder_name}")
        else:
            created_messages.append(f"Created folder: {folder_name}")

    return created_messages


def handle_query(service, payload: dict) -> List[str]:
    parent_from_llm = str(payload.get("parent_folder", ""))
    folders_from_llm = payload.get("folders", [])
    raw_query = str(payload.get("raw_query", ""))

    parent, folders = parse_drive_folders(raw_query, parent_from_llm, folders_from_llm)

    if not folders:
        raise RuntimeError("No drive folders detected in request")

    return create_multiple_folders(service, parent, folders)


def main() -> None:
    try:
        if len(sys.argv) < 2:
            raise ValueError("Missing JSON payload")

        payload = json.loads(sys.argv[1])
        creds = authenticate()
        service = build("drive", "v3", credentials=creds)

        messages = handle_query(service, payload)
        print("\n".join(messages))
    except Exception as exc:
        print(f"Drive service error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
